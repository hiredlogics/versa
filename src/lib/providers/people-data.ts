import {
  ApolloCreditsExhaustedError,
  enrichPeopleBatch,
  isApolloCreditsError,
  isUsableEmail,
  searchPeopleWithFilters,
} from "@/lib/apollo";
import { ProviderCreditsError } from "@/lib/pipeline/run";
import type { RunBatchDeps, SearchPageResult, UnlockedContact } from "@/lib/pipeline/run";
import { writeWhy } from "@/lib/pipeline/why";
import type { Candidate, ProviderSearchFilters } from "@/lib/pipeline/types";
import type { ApolloPerson, SearchCriteria } from "@/lib/types";

/**
 * The seam between the pipeline and the people-data vendor. This file lives
 * OUTSIDE src/lib/pipeline/ on purpose: it is the only place that imports the
 * vendor client and the only place its error types are translated, so the rule
 * for the pipeline directory stays absolute, nothing in it names the vendor.
 */

const PER_PAGE = 100;

/** The pipeline builds neutral filters; the client wants its own shape. */
function toVendorCriteria(filters: ProviderSearchFilters): SearchCriteria {
  return {
    industry: filters.qKeywords ?? "Any",
    country: filters.personLocations[0] ?? "United States",
    companySizeMin: 1,
    companySizeMax: 100_000,
    jobTitles: filters.personTitles,
    summary: "",
    apollo: filters, // vendor-name: provider client field
  } as SearchCriteria;
}

export async function searchPage(
  filters: ProviderSearchFilters,
  page: number
): Promise<SearchPageResult> {
  const result = await searchPeopleWithFilters(
    filters,
    toVendorCriteria(filters),
    page,
    PER_PAGE
  );

  return {
    people: result.people,
    // The client synthesises a page count from total_entries, so treat a
    // non-positive value as unknown rather than as "no pages left".
    totalPages: typeof result.totalPages === "number" && result.totalPages > 0
      ? result.totalPages
      : null,
  };
}

export async function unlockEmails(
  candidates: Candidate[]
): Promise<Map<string, UnlockedContact>> {
  const people = candidates.map(
    (candidate) =>
      ({
        id: candidate.providerId,
        first_name: candidate.name.split(" ")[0] ?? "",
        last_name: candidate.name.split(" ").slice(1).join(" "),
        title: candidate.title,
        email: null,
        linkedin_url: candidate.linkedinUrl,
        has_email: candidate.emailLikely,
        organization: {
          name: candidate.company,
          industry: candidate.industry ?? "",
          estimated_num_employees: candidate.employees ?? 0,
          city: "",
          state: "",
          country: "",
        },
      }) as ApolloPerson
  );

  try {
    const enriched = await enrichPeopleBatch(people);
    const map = new Map<string, UnlockedContact>();
    for (const result of enriched) {
      map.set(result.person.id, {
        email: result.person.email,
        emailStatus: result.person.email_status ?? null,
      });
    }
    return map;
  } catch (error) {
    // Translate here so nothing downstream needs the vendor's error types.
    if (error instanceof ApolloCreditsExhaustedError || isApolloCreditsError(error)) {
      throw new ProviderCreditsError();
    }
    throw error;
  }
}

export function providerDeps(): RunBatchDeps {
  return { searchPage, unlockEmails, writeWhy, isUsableEmail };
}
