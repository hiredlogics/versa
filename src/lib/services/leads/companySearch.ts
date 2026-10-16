import { z } from "zod";
import { searchPeopleWithFilters } from "@/lib/apollo";
import { aiChat } from "@/lib/services/ai/aiRouter";
import type { ApolloSearchFilters, SearchCriteria } from "@/lib/types";

/** Shown to the user as is, so it explains what to do next. */
export class CompanyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyNotFoundError";
  }
}

/** "https://www.Stripe.com/about" or "stripe.com" → "stripe.com"; null when it is not a website. */
export function domainFromInput(value: string): string | null {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#].*)?$/);
  return match ? match[1] : null;
}

/** "CTO, engineering managers and recruiters" → ["CTO", "engineering managers", "recruiters"]. */
export function titlesFromRoles(roles: string | undefined): string[] {
  return (roles ?? "")
    .split(/,|;|\n|\band\b|\//i)
    .map((role) => role.trim())
    .filter((role) => role.length > 1)
    .slice(0, 5);
}

const guessSchema = z.object({ domain: z.string().nullable() });

/** Asks AI for the company's main website; null when it is not sure which company it is. */
async function guessDomain(companyName: string, userId?: string): Promise<string | null> {
  try {
    const { content } = await aiChat({
      operation: "parse",
      userId,
      jsonMode: true,
      temperature: 0,
      system:
        'Return the main website domain of the company the user names, as JSON {"domain": "example.com"}. ' +
        'Use {"domain": null} when you are not sure which company it is or several companies share the name.',
      user: companyName,
    });
    const parsed = guessSchema.safeParse(JSON.parse(content));
    return parsed.success && parsed.data.domain ? domainFromInput(parsed.data.domain) : null;
  } catch {
    return null;
  }
}

/**
 * Search criteria for "people who work at this company". The company is found from its
 * website (or a name, through AI), then checked with the free people count before any
 * paid step, so a wrong or unknown company never costs credits.
 */
export async function buildCompanyCriteria(input: {
  company: string;
  roles?: string;
  userId?: string;
}): Promise<SearchCriteria> {
  const company = input.company.trim();
  const domain = domainFromInput(company) ?? (await guessDomain(company, input.userId));
  if (!domain) {
    throw new CompanyNotFoundError(
      `We couldn't tell which company "${company}" is. Enter its website instead, like stripe.com.`
    );
  }

  const titles = titlesFromRoles(input.roles);
  const apollo: ApolloSearchFilters = {
    personTitles: titles,
    personLocations: [],
    organizationDomains: [domain],
    includeSimilarTitles: true,
  };
  const label = `${titles.length ? titles.join(", ") : "People"} at ${company}`;
  const criteria: SearchCriteria = {
    industry: "Any",
    country: "",
    companySizeMin: 0,
    companySizeMax: 0,
    jobTitles: titles,
    keywords: "",
    summary: domain === company.toLowerCase() ? label : `${label} (${domain})`,
    searchIntent: `${input.roles?.trim() || "People"} who work at ${company} (${domain})`,
    requireEmail: true,
    companyOnly: true,
    apollo,
  };

  const check = await searchPeopleWithFilters({ ...apollo, personTitles: [] }, criteria, 1, 1);
  if (check.totalEntries === 0) {
    throw new CompanyNotFoundError(
      `We found no people at ${domain}. Check the company's website and try again.`
    );
  }
  return criteria;
}
