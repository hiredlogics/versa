export interface ApolloEmploymentEntry {
  title?: string;
  organization_name?: string;
  current?: boolean;
  start_date?: string;
  end_date?: string;
}

export interface ApolloProfileRaw {
  headline?: string;
  seniority?: string;
  departments?: string[];
  city?: string;
  state?: string;
  country?: string;
  employment_history?: ApolloEmploymentEntry[];
}

export function extractProfileSummary(raw: ApolloProfileRaw | null | undefined): string | null {
  if (!raw) return null;

  const parts: string[] = [];

  if (raw.headline?.trim()) {
    parts.push(raw.headline.trim());
  }

  const history = raw.employment_history ?? [];
  if (history.length > 0) {
    const roles = history.slice(0, 4).map((entry) => {
      const title = entry.title?.trim() || "Role";
      const org = entry.organization_name?.trim() || "Unknown company";
      const tenure = entry.current ? " (current)" : "";
      return `${title} at ${org}${tenure}`;
    });
    parts.push(`Career: ${roles.join("; ")}`);
  }

  if (raw.seniority?.trim()) {
    parts.push(`Seniority: ${raw.seniority.trim()}`);
  }

  if (raw.departments?.length) {
    parts.push(`Departments: ${raw.departments.slice(0, 3).join(", ")}`);
  }

  return parts.length > 0 ? parts.join(". ") : null;
}

export function toStoredApolloProfile(raw: ApolloProfileRaw | null | undefined): object | null {
  if (!raw) return null;

  return {
    headline: raw.headline ?? null,
    seniority: raw.seniority ?? null,
    departments: raw.departments?.slice(0, 5) ?? [],
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: raw.country ?? null,
    employment_history: (raw.employment_history ?? []).slice(0, 6).map((entry) => ({
      title: entry.title ?? null,
      organization_name: entry.organization_name ?? null,
      current: entry.current ?? false,
      start_date: entry.start_date ?? null,
      end_date: entry.end_date ?? null,
    })),
  };
}
