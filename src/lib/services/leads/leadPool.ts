import { Prisma, type LeadPoolPerson } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isUsableEmail, revealEmailsForPeople } from "@/lib/apollo";
import { filterExcludedLeads } from "@/lib/context/exclusions";
import { isVerifiedEmail } from "@/lib/email-confidence";
import {
  mergePoolPerson,
  normalizeLinkedInUrl,
  poolInputFromApolloPerson,
  poolLocationTerms,
  poolPersonKeys,
  type PoolPersonData,
  type PoolPersonInput,
} from "@/lib/lead-pool";
import { normalizeTitle } from "@/lib/role-policy";
import { requireVerifiedEmail } from "@/lib/services/leads/fetchProgress";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";
import type { ApolloPerson, SearchCriteria } from "@/lib/types";
import { scoreOpenToWorkForLeads } from "@/lib/services/leads/openToWorkSignals";

/** Do not pay Apollo again for a person whose email lookup came back empty this recently. */
const EMAIL_RECHECK_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

function toData(row: LeadPoolPerson): PoolPersonData {
  return {
    apolloPersonId: row.apolloPersonId,
    linkedinUrl: row.linkedinUrl,
    name: row.name,
    title: row.title,
    titleNormalized: row.titleNormalized,
    headline: row.headline,
    company: row.company,
    industry: row.industry,
    employees: row.employees,
    city: row.city,
    state: row.state,
    country: row.country,
    locationText: row.locationText,
    email: row.email,
    emailStatus: row.emailStatus,
    emailCheckedAt: row.emailCheckedAt,
    openToWorkSignal: row.openToWorkSignal,
    sources: row.sources,
    profile: (row.profile as object | null) ?? null,
  };
}

/** Merge inputs that describe the same person before touching the database. */
function dedupeInputs(inputs: PoolPersonInput[]): PoolPersonInput[] {
  const byKey = new Map<string, PoolPersonInput>();
  const keyOf = new Map<string, string>();
  const out: PoolPersonInput[] = [];
  for (const input of inputs) {
    const keys = poolPersonKeys(input);
    if (keys.length === 0) continue;
    const existingKey = keys.map((key) => keyOf.get(key)).find(Boolean);
    if (existingKey) {
      const previous = byKey.get(existingKey)!;
      const merged = { ...previous };
      for (const [field, value] of Object.entries(input)) {
        if (value !== null && value !== undefined && value !== "") {
          (merged as Record<string, unknown>)[field] = value;
        }
      }
      byKey.set(existingKey, merged);
      for (const key of keys) keyOf.set(key, existingKey);
    } else {
      byKey.set(keys[0], input);
      for (const key of keys) keyOf.set(key, keys[0]);
    }
  }
  for (const value of byKey.values()) out.push(value);
  return out;
}

/**
 * Insert or update people in the shared pool, matched by Apollo id or LinkedIn
 * URL. Records with neither key are skipped because they cannot be de-duplicated.
 * Returns how many rows were created and updated.
 */
export async function upsertPoolPeople(
  inputs: PoolPersonInput[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  const unique = dedupeInputs(inputs);

  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const apolloIds = chunk.map((p) => p.apolloPersonId).filter((id): id is string => Boolean(id));
    const urls = chunk
      .map((p) => normalizeLinkedInUrl(p.linkedinUrl))
      .filter((url): url is string => Boolean(url));
    const existingRows = await prisma.leadPoolPerson.findMany({
      where: {
        OR: [
          ...(apolloIds.length ? [{ apolloPersonId: { in: apolloIds } }] : []),
          ...(urls.length ? [{ linkedinUrl: { in: urls } }] : []),
        ],
      },
    });
    const byKey = new Map<string, LeadPoolPerson>();
    for (const row of existingRows) {
      for (const key of poolPersonKeys(row)) byKey.set(key, row);
    }

    for (const input of chunk) {
      const existing = poolPersonKeys(input).map((key) => byKey.get(key)).find(Boolean) ?? null;
      const data = mergePoolPerson(existing ? toData(existing) : null, input);
      // A second row may already own the Apollo id or URL this merge adds.
      if (existing && data.apolloPersonId && data.apolloPersonId !== existing.apolloPersonId) {
        const owner = byKey.get(data.apolloPersonId);
        if (owner && owner.id !== existing.id) data.apolloPersonId = existing.apolloPersonId;
      }
      if (existing && data.linkedinUrl && data.linkedinUrl !== existing.linkedinUrl) {
        const owner = byKey.get(data.linkedinUrl);
        if (owner && owner.id !== existing.id) data.linkedinUrl = existing.linkedinUrl;
      }

      try {
        // Prisma's nullable JSON field rejects plain null; use Prisma.JsonNull instead.
        const prismaData = {
          ...data,
          profile: data.profile ?? Prisma.JsonNull,
        };
        const row = existing
          ? await prisma.leadPoolPerson.update({ where: { id: existing.id }, data: prismaData })
          : await prisma.leadPoolPerson.create({ data: prismaData });
        if (existing) updated += 1;
        else created += 1;
        for (const key of poolPersonKeys(row)) byKey.set(key, row);
      } catch (error) {
        // Another search saved the same person between our read and write.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }
  }
  return { created, updated };
}

/**
 * Save Apollo people into the pool without letting a pool failure break the
 * search that found them.
 */
export async function recordApolloPeopleInPool(
  people: ApolloPerson[],
  source: string,
  options: { emailChecked?: boolean } = {}
): Promise<void> {
  if (people.length === 0) return;
  try {
    await upsertPoolPeople(people.map((person) => poolInputFromApolloPerson(person, source, options)));
  } catch (error) {
    console.warn("[lead-pool] could not record people:", error instanceof Error ? error.message : error);
  }
}

/** Existing fully matched people can be re-used without another Apollo lookup. */
export async function findMatchedPoolPeople(people: ApolloPerson[]): Promise<LeadPoolPerson[]> {
  const ids = people.map((person) => person.id).filter(Boolean);
  if (ids.length === 0) return [];
  return prisma.leadPoolPerson.findMany({
    where: {
      apolloPersonId: { in: ids },
      linkedinUrl: { not: null },
      emailCheckedAt: { not: null },
    },
  });
}

/** Pool rows whose title and location match the search. */
export async function findPoolCandidates(
  criteria: SearchCriteria,
  limit: number
): Promise<LeadPoolPerson[]> {
  const titles = [...new Set((criteria.apollo?.personTitles ?? criteria.jobTitles).map(normalizeTitle))].filter(
    Boolean
  );
  if (titles.length === 0 || limit <= 0) return [];

  const locationTerms = poolLocationTerms(criteria.apollo?.personLocations ?? [], criteria.country);
  const where: Prisma.LeadPoolPersonWhereInput = {
    AND: [
      { OR: titles.map((title) => ({ titleNormalized: { contains: title } })) },
      criteria.country
        ? { OR: [{ country: { equals: criteria.country, mode: "insensitive" } }, { country: null }] }
        : {},
      locationTerms.length
        ? { OR: locationTerms.map((term) => ({ locationText: { contains: term } })) }
        : {},
    ],
  };

  return prisma.leadPoolPerson.findMany({
    where,
    // People with an email and a LinkedIn profile first, then the freshest.
    orderBy: [{ email: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: limit,
  });
}

export type PoolServeResult = {
  /** Leads saved to this search from the pool. */
  saved: number;
  /** Of those, how many needed a new Apollo email unlock (these cost credits). */
  unlockedSaved: number;
  /** Apollo unlock attempts made, whether or not they found an email. */
  unlockAttempts: number;
  creditsExhausted: boolean;
};

function hasDeliverableEmail(row: Pick<LeadPoolPerson, "email" | "emailStatus">): boolean {
  if (!isUsableEmail(row.email)) return false;
  return requireVerifiedEmail() ? isVerifiedEmail(row.email, row.emailStatus) : true;
}

function worthUnlocking(row: LeadPoolPerson, now: number): boolean {
  if (!row.apolloPersonId && !row.linkedinUrl) return false;
  if (!row.emailCheckedAt) return true;
  return now - row.emailCheckedAt.getTime() > EMAIL_RECHECK_AFTER_MS;
}

/**
 * First step of every search: deliver matching people we already have.
 * When the user asked for emails, people without one are unlocked through
 * Apollo (at most two attempts per missing lead) and the result is written
 * back to the pool so nobody pays for the same email twice.
 */
export async function serveFromPool(input: {
  userId: string;
  searchId: string;
  criteria: SearchCriteria;
  prompt: string;
  limit: number;
  wantsEmail: boolean;
  /** Keys (Apollo ids and LinkedIn URLs) already delivered in this search. Updated in place. */
  seenIds: Set<string>;
}): Promise<PoolServeResult> {
  const empty: PoolServeResult = { saved: 0, unlockedSaved: 0, unlockAttempts: 0, creditsExhausted: false };
  if (input.limit <= 0) return empty;

  const candidates = filterExcludedLeads(
    await findPoolCandidates(input.criteria, Math.min(input.limit * 4, 500)),
    input.criteria.excludedTitles ?? [],
    input.criteria.excludedIndustries ?? [],
    input.prompt
  ).filter((row) => !poolPersonKeys(row).some((key) => input.seenIds.has(key)));

  let selected: LeadPoolPerson[];
  let unlockedIds = new Set<string>();
  let unlockAttempts = 0;
  let creditsExhausted = false;

  if (!input.wantsEmail) {
    selected = candidates.filter((row) => row.linkedinUrl).slice(0, input.limit);
  } else {
    const ready = candidates.filter(hasDeliverableEmail).slice(0, input.limit);
    const slots = input.limit - ready.length;
    const now = Date.now();
    const toUnlock = candidates
      .filter((row) => !hasDeliverableEmail(row) && worthUnlocking(row, now))
      .slice(0, slots * 2);

    const unlocked: LeadPoolPerson[] = [];
    if (slots > 0 && toUnlock.length > 0) {
      const reveal = await revealEmailsForPeople(
        toUnlock.map((row) => ({ id: row.apolloPersonId, linkedinUrl: row.linkedinUrl })),
        { revealPersonalEmails: true }
      );
      unlockAttempts = reveal.attempted;
      creditsExhausted = reveal.creditsExhausted;

      const updates: PoolPersonInput[] = [];
      reveal.results.forEach((person, index) => {
        const row = toUnlock[index];
        updates.push(
          person
            ? {
                ...poolInputFromApolloPerson(person.person, "apollo_enrich", { emailChecked: true }),
                // Keep the pool row's own keys so the result lands on that row.
                apolloPersonId: row.apolloPersonId ?? person.person.id,
                linkedinUrl: row.linkedinUrl ?? person.person.linkedin_url,
              }
            : {
                apolloPersonId: row.apolloPersonId,
                linkedinUrl: row.linkedinUrl,
                name: row.name,
                title: row.title,
                emailChecked: true,
                source: "apollo_enrich",
              }
        );
      });
      await upsertPoolPeople(updates);

      const refreshed = await prisma.leadPoolPerson.findMany({
        where: { id: { in: toUnlock.slice(0, reveal.attempted).map((row) => row.id) } },
      });
      for (const row of refreshed) {
        if (hasDeliverableEmail(row) && unlocked.length < slots) unlocked.push(row);
      }
      unlockedIds = new Set(unlocked.map((row) => row.id));
    }
    selected = [...ready, ...unlocked];
  }

  if (selected.length === 0) {
    logLeadFetch("lead_pool_served", { searchId: input.searchId, candidates: candidates.length, saved: 0 });
    return { ...empty, unlockAttempts, creditsExhausted };
  }

  const otwScores = await scoreOpenToWorkForLeads(
    selected.map((row) => ({ title: row.title, company: row.company, profile: row.profile }))
  );

  await prisma.lead.createMany({
    data: selected.map((row, i) => {
      const location = [row.city, row.state, row.country].filter(Boolean).join(", ") || null;
      const withEmail = isUsableEmail(row.email) && (input.wantsEmail || hasDeliverableEmail(row));
      return {
        userId: input.userId,
        searchId: input.searchId,
        apolloPersonId: row.apolloPersonId,
        name: row.name,
        title: row.title,
        company: row.company || "Unknown",
        industry: row.industry,
        employees: row.employees,
        location,
        email: withEmail ? row.email : null,
        emailStatus: withEmail ? row.emailStatus : null,
        linkedinUrl: row.linkedinUrl,
        leadScore: withEmail ? 7 : 5,
        priorityLevel: "MEDIUM" as const,
        reasoning: row.openToWorkSignal
          ? `${row.title}${location ? ` in ${location}` : ""}. Public open-to-work signal: "${row.openToWorkSignal}".`
          : `${row.title}${location ? ` in ${location}` : ""}, matching the requested role and location.`,
        recommendedApproach: "",
        matchedSkills: [],
        missingSkills: [],
        openToWorkLevel: otwScores[i].level,
        openToWorkReasons: otwScores[i].reasons,
        hasEmail: withEmail,
        // Copy the cached profile snapshot into rawApolloData so downstream
        // features (scoring, open-to-work) have access to job history.
        rawApolloData: row.profile ?? undefined,
      };
    }),
  });

  for (const row of selected) {
    for (const key of poolPersonKeys(row)) input.seenIds.add(key);
  }

  const result: PoolServeResult = {
    saved: selected.length,
    unlockedSaved: selected.filter((row) => unlockedIds.has(row.id)).length,
    unlockAttempts,
    creditsExhausted,
  };
  logLeadFetch("lead_pool_served", { searchId: input.searchId, candidates: candidates.length, ...result });
  return result;
}
