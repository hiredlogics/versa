import { prisma } from "@/lib/db/prisma";
import { commit, release, reserve } from "./credits";
import { check, finalize, toCandidate, toFilters } from "./verify";
import { writeWhy as defaultWriteWhy } from "./why";
import type {
  Brief,
  Candidate,
  ProviderSearchFilters,
  RejectReason,
  VerifiedLead,
} from "./types";

/** People delivered per user-approved batch. One call, one batch — never a loop. */
export const BATCH_SIZE = clampBatchSize(process.env.LEAD_BATCH_SIZE);

/** Search pages one batch may read, so a bad filter cannot spin. */
export const PAGE_BUDGET = 10;

function clampBatchSize(raw: string | undefined): number {
  const parsed = parseInt(raw || "", 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(200, Math.max(10, parsed));
}

/** Thrown by the provider adapter when the vendor refuses on credits. */
export class ProviderCreditsError extends Error {
  constructor(message = "Provider credits exhausted") {
    super(message);
    this.name = "ProviderCreditsError";
  }
}

export type BatchReason =
  | "delivered"
  | "fulfilled"
  | "exhausted"
  | "no_matches_this_pass"
  | "provider_unavailable"
  | "failed";

const NOTES: Record<BatchReason, string> = {
  delivered: "Batch saved.",
  fulfilled: "You already have every lead you asked for.",
  exhausted: "That's everyone matching these filters — widen the roles or the location for more.",
  no_matches_this_pass:
    "No matches on those pages. Try again to keep looking, or widen the roles.",
  provider_unavailable:
    "Verification is temporarily unavailable. Nothing was charged — try again shortly.",
  failed: "The batch stopped before finishing. Nothing was charged.",
};

export interface BatchOutcome {
  batchNo: number;
  reason: BatchReason;
  note: string;
  fetched: number;
  survivors: number;
  saved: number;
  charged: number;
  refunded: number;
  hasMore: boolean;
  nextPage: number;
  rejections: Partial<Record<RejectReason, number>>;
}

export interface SearchPageResult {
  people: unknown[];
  /** Absent metadata, not evidence — null means unknown, keep going. */
  totalPages: number | null;
}

export interface UnlockedContact {
  email: string | null;
  emailStatus: string | null;
}

export interface RunBatchDeps {
  searchPage: (filters: ProviderSearchFilters, page: number) => Promise<SearchPageResult>;
  unlockEmails: (candidates: Candidate[]) => Promise<Map<string, UnlockedContact>>;
  writeWhy: typeof defaultWriteWhy;
  isUsableEmail: (email: string) => boolean;
}

function outcome(partial: Partial<BatchOutcome> & { batchNo: number; reason: BatchReason }): BatchOutcome {
  return {
    note: NOTES[partial.reason],
    fetched: 0,
    survivors: 0,
    saved: 0,
    charged: 0,
    refunded: 0,
    hasMore: partial.reason === "no_matches_this_pass" || partial.reason === "provider_unavailable",
    nextPage: 1,
    rejections: {},
    ...partial,
  };
}

export async function runBatch(
  input: { userId: string; searchId: string; brief: Brief },
  deps: RunBatchDeps
): Promise<BatchOutcome> {
  const { userId, searchId, brief } = input;

  const search = await prisma.leadSearch.findUnique({
    where: { id: searchId },
    select: { id: true, leadsReturned: true, nextPage: true, batchesDone: true, totalPages: true },
  });
  if (!search) throw new Error(`Search ${searchId} not found`);

  const batchNo = search.batchesDone + 1;
  const want = Math.min(BATCH_SIZE, brief.requestedTotal - search.leadsReturned);

  // Fulfilled is terminal and costs nothing: no reserve, no provider calls.
  if (want <= 0) {
    return outcome({ batchNo, reason: "fulfilled", hasMore: false, nextPage: search.nextPage });
  }

  const saved = await prisma.lead.findMany({
    where: { searchId, deletedAt: null },
    select: { apolloPersonId: true }, // vendor-name: database column, renamed in Phase 10
  });
  const seen = new Set(
    saved.map((row) => row.apolloPersonId).filter(Boolean) as string[] // vendor-name: database column, renamed in Phase 10
  );

  const filters = toFilters(brief);
  const rejections: Partial<Record<RejectReason, number>> = {};
  const tally = (reason: RejectReason) => {
    rejections[reason] = (rejections[reason] ?? 0) + 1;
  };

  // Verify on FREE search data before paying to unlock anyone.
  const survivors: Array<{ candidate: Candidate; fit: number }> = [];
  let page = search.nextPage;
  let nextPage = page;
  let pagesRead = 0;
  let fetched = 0;
  let totalPages = search.totalPages;
  let sawEmptyPage = false;

  while (survivors.length < want && pagesRead < PAGE_BUDGET) {
    const result = await deps.searchPage(filters, page);
    pagesRead += 1;

    // Missing totalPages means unknown, so keep the previous value rather than
    // letting absent metadata look like an answer.
    if (typeof result.totalPages === "number") totalPages = result.totalPages;

    if (result.people.length === 0) {
      // An empty page IS evidence of exhaustion, unlike null metadata.
      sawEmptyPage = true;
      nextPage = page;
      break;
    }

    for (const person of result.people) {
      fetched += 1;
      const candidate = toCandidate(person as Parameters<typeof toCandidate>[0]);

      if (!candidate.providerId || seen.has(candidate.providerId)) {
        tally("duplicate");
        continue;
      }
      seen.add(candidate.providerId);

      const verdict = check(candidate, brief);
      if (!verdict.keep) {
        tally(verdict.reason);
        continue;
      }

      survivors.push({ candidate, fit: verdict.fit });
      if (survivors.length >= want) break;
    }

    if (survivors.length >= want) {
      // Page may be partly unread; dedupe protects a re-read next batch.
      nextPage = page;
      break;
    }

    page += 1;
    nextPage = page;
  }

  if (survivors.length === 0) {
    const pagesRemain = totalPages === null || nextPage <= totalPages;
    const reason: BatchReason = sawEmptyPage || !pagesRemain ? "exhausted" : "no_matches_this_pass";

    await prisma.leadSearch.update({
      where: { id: searchId },
      data: {
        status: "COMPLETE",
        nextPage: reason === "exhausted" ? nextPage : nextPage + 1,
        totalPages,
        statusNote: NOTES[reason],
      },
    });

    // Returns before reserving: there is no hold to settle.
    return outcome({
      batchNo,
      reason,
      fetched,
      rejections,
      hasMore: reason === "no_matches_this_pass",
      nextPage: reason === "exhausted" ? nextPage : nextPage + 1,
    });
  }

  // Reserve for survivors, not for people fetched.
  const hold = await reserve({
    userId,
    searchId,
    amount: survivors.length,
    idempotencyKey: `${searchId}:${batchNo}`,
  });

  try {
    let unlocked: Map<string, UnlockedContact>;
    try {
      unlocked = await deps.unlockEmails(survivors.map((s) => s.candidate));
    } catch (error) {
      if (error instanceof ProviderCreditsError) {
        await release(hold.id);
        await prisma.leadSearch.update({
          where: { id: searchId },
          data: { status: "COMPLETE", statusNote: NOTES.provider_unavailable, totalPages },
        });
        return outcome({
          batchNo,
          reason: "provider_unavailable",
          fetched,
          survivors: survivors.length,
          rejections,
          hasMore: true,
          nextPage,
        });
      }
      throw error;
    }

    const leads: VerifiedLead[] = [];
    for (const { candidate, fit } of survivors) {
      const contact = unlocked.get(candidate.providerId);
      const result = finalize(
        candidate,
        fit,
        contact?.email,
        deps.isUsableEmail,
        contact?.emailStatus ?? null
      );
      if (!result.keep) {
        tally(result.reason);
        continue;
      }
      leads.push(result.lead);
    }

    const withWhy = await deps.writeWhy(leads, brief, { userId, searchId });

    const created = await prisma.lead.createMany({
      skipDuplicates: true,
      data: withWhy.map((lead) => ({
        userId,
        searchId,
        apolloPersonId: lead.candidate.providerId, // vendor-name: database column, renamed in Phase 10
        name: lead.candidate.name,
        title: lead.candidate.title,
        company: lead.candidate.company,
        industry: lead.candidate.industry,
        employees: lead.candidate.employees,
        location: lead.candidate.location,
        email: lead.email,
        emailStatus: lead.emailStatus,
        linkedinUrl: lead.candidate.linkedinUrl,
        leadScore: Math.max(1, Math.round(lead.fit / 10)),
        priorityLevel: lead.fit >= 80 ? "VERY_HIGH" : lead.fit >= 60 ? "HIGH" : "MEDIUM",
        reasoning: lead.why ?? null,
        whySource: lead.whySource ?? "TEMPLATE",
        recommendedApproach: "",
        hasEmail: true,
      })),
    });

    const settled = await commit(hold.id, created.count);
    const leadsReturned = search.leadsReturned + created.count;
    const hasMore =
      leadsReturned < brief.requestedTotal && (totalPages === null || nextPage <= totalPages);

    await prisma.leadSearch.update({
      where: { id: searchId },
      data: {
        status: "COMPLETE",
        leadsReturned,
        nextPage,
        totalPages,
        batchesDone: batchNo,
        statusNote: hasMore
          ? `Saved ${created.count}. Ask for the next batch when you're ready.`
          : NOTES.delivered,
        errorMessage: null,
      },
    });

    return outcome({
      batchNo,
      reason: "delivered",
      note: hasMore
        ? `Saved ${created.count}. Ask for the next batch when you're ready.`
        : NOTES.delivered,
      fetched,
      survivors: survivors.length,
      saved: created.count,
      charged: settled.charged,
      refunded: settled.refunded,
      hasMore,
      nextPage,
      rejections,
    });
  } catch (error) {
    // The user's plan credits and the provider's credits are different currencies.
    // When a step after the unlock fails, the provider cost is already spent and
    // unrecoverable — but the user received zero rows. Charging them for our failed
    // step converts our cost into their debt. The hold releases. The provider cost is
    // ours to eat and ours to fix.
    await release(hold.id).catch((releaseError) => {
      console.error("[runBatch] release failed, releaseStale is the backstop:", releaseError);
    });

    await prisma.leadSearch
      .update({
        where: { id: searchId },
        data: { status: "FAILED", statusNote: NOTES.failed, totalPages },
      })
      .catch(() => {});

    throw error;
  }
}
