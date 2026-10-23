import { prisma } from "@/lib/db/prisma";
import {
  formatApolloPerson,
  normalizePerson,
  type ApolloSearchRawPerson,
  type EnrichedApolloResult,
} from "@/lib/apollo";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";

/**
 * Contact pool: every person we ever paid Apollo to unlock.
 *
 * Apollo charges one credit per unlock and charges again for repeats
 * (measured 2026-10-23), so before unlocking anyone we look them up here and
 * reuse the stored record for free. Every unlock result is written back, even
 * the ones a later quality check rejects, because the credit is already spent
 * and the contact may fit a different search.
 */

function toEnriched(row: {
  apolloPersonId: string;
  name: string;
  title: string;
  company: string;
  industry: string | null;
  employees: number | null;
  location: string | null;
  email: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  rawApolloData: unknown;
}): EnrichedApolloResult {
  const raw =
    row.rawApolloData && typeof row.rawApolloData === "object"
      ? (row.rawApolloData as ApolloSearchRawPerson)
      : null;
  if (raw && raw.id) {
    const person = normalizePerson(raw);
    // The columns are the source of truth for contact data.
    person.email = row.email ?? person.email;
    person.email_status = row.emailStatus ?? person.email_status ?? null;
    return { person, raw };
  }
  const [first, ...rest] = row.name.split(" ");
  return {
    person: {
      id: row.apolloPersonId,
      first_name: first || row.name,
      last_name: rest.join(" "),
      title: row.title,
      email: row.email,
      email_status: row.emailStatus,
      linkedin_url: row.linkedinUrl,
      has_email: Boolean(row.email),
      organization: {
        name: row.company,
        industry: row.industry ?? "N/A",
        estimated_num_employees: row.employees ?? 0,
        city: "",
        state: "",
        country: "",
      },
    },
    raw: null,
  };
}

/** Returns the stored unlock result for every id we already paid for. */
export async function lookupContactPool(
  apolloPersonIds: string[]
): Promise<Map<string, EnrichedApolloResult>> {
  const hits = new Map<string, EnrichedApolloResult>();
  if (apolloPersonIds.length === 0) return hits;
  const rows = await prisma.unlockedContact.findMany({
    where: { apolloPersonId: { in: apolloPersonIds } },
  });
  for (const row of rows) hits.set(row.apolloPersonId, toEnriched(row));
  return hits;
}

/** Records unlock results so no later search pays for the same person. */
export async function saveToContactPool(
  results: EnrichedApolloResult[],
  unlockedByUserId: string
): Promise<number> {
  const fresh = results.filter((r) => r.raw && r.raw.id);
  for (const result of fresh) {
    const full = formatApolloPerson(result.person);
    await prisma.unlockedContact.upsert({
      where: { apolloPersonId: result.person.id },
      create: {
        apolloPersonId: result.person.id,
        name: full.name,
        title: full.title,
        company: full.company,
        industry: full.industry !== "N/A" ? full.industry : null,
        employees: full.employees || null,
        location: full.location !== "N/A" ? full.location : null,
        email: full.email,
        emailStatus: full.emailStatus ?? null,
        linkedinUrl: full.linkedinUrl,
        rawApolloData: result.raw as object,
        unlockedByUserId,
      },
      update: {
        name: full.name,
        title: full.title,
        company: full.company,
        industry: full.industry !== "N/A" ? full.industry : null,
        employees: full.employees || null,
        location: full.location !== "N/A" ? full.location : null,
        email: full.email,
        emailStatus: full.emailStatus ?? null,
        linkedinUrl: full.linkedinUrl,
        rawApolloData: result.raw as object,
      },
    });
  }
  if (fresh.length > 0) {
    logLeadFetch("contact_pool_saved", { saved: fresh.length });
  }
  return fresh.length;
}
