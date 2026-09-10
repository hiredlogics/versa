"use client";

import { useState, useMemo } from "react";
import {
  UserCheck,
  Download,
  Loader2,
  Search,
  CheckCircle,
  XCircle,
  MapPin,
  Briefcase,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Zap,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

interface Candidate {
  name: string;
  title: string;
  location: string;
  linkedinUrl?: string;
  isOpenToWork: boolean;
  otwSignal?: "apolloKeyword" | "titleHeadline";
  matchedKeywords?: string[];
  linkedinEnrichment?: "not_requested" | "found" | "unavailable";
  checkedAt: string;
}

interface SearchResponse {
  candidates: Candidate[];
  scanned: number;
  scanLimit: number;
  enrichedForLinkedInUrl: number;
}

const PRESET_ROLES = [
  "React Developer",
  "Full Stack Engineer",
  "DevOps Engineer",
  "Account Executive",
  "Product Designer",
  "Data Scientist",
];

const SIGNAL_LABEL: Record<string, string> = {
  apolloKeyword: "Apollo keyword search match",
  titleHeadline: "Apollo title/headline match",
};

export default function OpenToWorkPage() {
  const [role, setRole] = useState("React Developer");
  const [location, setLocation] = useState("United States");
  const [count, setCount] = useState("10");
  const [isCustomCount, setIsCustomCount] = useState(false);
  const [customCount, setCustomCount] = useState("500");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [enrichLinkedInUrls, setEnrichLinkedInUrls] = useState(false);
  const [enrichLimit, setEnrichLimit] = useState("50");
  const [enrichedForLinkedInUrl, setEnrichedForLinkedInUrl] = useState(0);

  // Table pagination & filter
  const [tablePage, setTablePage] = useState(1);
  const [filterMode, setFilterMode] = useState<"all" | "otw">("all");
  const PAGE_SIZE = 20;

  const effectiveCount = isCustomCount
    ? Math.min(Math.max(Number(customCount) || 10, 1), 5000)
    : Number(count);

  const isBulkMode = effectiveCount > 25;

  // ── CSV download helper ──────────────────────────────────────────────
  const downloadCsv = (list: Candidate[], targetRole: string) => {
    const headers = [
      "Candidate Name",
      "Job Title",
      "Location",
      "LinkedIn Profile URL",
      "Open To Work",
      "Detection Method",
      "Checked Date",
    ];
    const esc = (v: string | undefined | null) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;

    const signalLabel = (c: Candidate) => {
      if (!c.isOpenToWork) return "No";
      return c.otwSignal === "titleHeadline"
        ? "Apollo title/headline match"
        : "Apollo keyword search match";
    };

    const rows = list.map((c) =>
      [
        esc(c.name),
        esc(c.title),
        esc(c.location),
        esc(c.linkedinUrl),
        esc(c.isOpenToWork ? "YES" : "NO"),
        esc(signalLabel(c)),
        esc(c.checkedAt.split("T")[0]),
      ].join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `open-to-work-${targetRole
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Search ───────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!role.trim()) {
      setError("Please enter a role to search.");
      return;
    }
    setError(null);
    setLoading(true);
    setCandidates(null);
    setTablePage(1);

    try {
      const res = await fetch("/api/open-to-work/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          location,
          count: effectiveCount,
          format: "json",
          enrichLinkedInUrls,
          enrichLimit: Number(enrichLimit),
        }),
      });

      const data = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Search failed");

      const list: Candidate[] = data.candidates ?? [];
      setCandidates(list);
      setScanned(data.scanned ?? 0);
      setEnrichedForLinkedInUrl(data.enrichedForLinkedInUrl ?? 0);

      if (list.length === 0) {
        setError(`No possible Open To Work profiles found after searching ${data.scanned ?? 0} Apollo results. Try a broader role or location.`);
      } else {
        downloadCsv(list, role);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const openToWorkCount = candidates?.filter((c) => c.isOpenToWork).length ?? 0;

  // Filtered & paginated view
  const displayedCandidates = useMemo(() => {
    if (!candidates) return [];
    if (filterMode === "otw") {
      return candidates.filter((c) => c.isOpenToWork);
    }
    return candidates;
  }, [candidates, filterMode]);

  const totalPages = Math.max(1, Math.ceil(displayedCandidates.length / PAGE_SIZE));
  const pagedCandidates = useMemo(() => {
    const start = (tablePage - 1) * PAGE_SIZE;
    return displayedCandidates.slice(start, start + PAGE_SIZE);
  }, [displayedCandidates, tablePage]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-b border-lp-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-lp-white md:text-2xl">
              LinkedIn Open To Work Finder
            </h1>
            <p className="text-sm text-lp-muted">
              Find Apollo role and location profiles using job-seeking{" "}
              <span className="font-medium text-emerald-400">#OpenToWork</span>{" "}
              and job-seeking wording, then export the matches to CSV.
            </p>
          </div>
        </div>
      </div>

      {/* ── Search Filters ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-lp-border bg-lp-panel p-6 shadow-sm space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Role */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-lp-off-white">
              <Briefcase className="h-3.5 w-3.5 text-lp-primary" />
              Target Role / Title
            </label>
            <input
              id="otw-role-input"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g. React Developer"
              className="w-full rounded-xl border border-lp-border bg-lp-graphite px-3 py-2 text-sm text-lp-white placeholder-lp-muted-dark focus:border-lp-primary focus:outline-none"
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-lp-off-white">
              <MapPin className="h-3.5 w-3.5 text-lp-primary" />
              Location
            </label>
            <input
              id="otw-location-input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. United States, Germany"
              className="w-full rounded-xl border border-lp-border bg-lp-graphite px-3 py-2 text-sm text-lp-white placeholder-lp-muted-dark focus:border-lp-primary focus:outline-none"
            />
          </div>

          {/* Count */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-lp-off-white">
              Profiles to Scan
            </label>
            <div className="flex gap-2">
              <select
                id="otw-count-select"
                value={isCustomCount ? "custom" : count}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setIsCustomCount(true);
                  } else {
                    setIsCustomCount(false);
                    setCount(e.target.value);
                  }
                }}
                className="w-full rounded-xl border border-lp-border bg-lp-graphite px-3 py-2 text-sm text-lp-white focus:border-lp-primary focus:outline-none"
              >
                <option value="10">Scan 10 profiles</option>
                <option value="25">Scan 25 profiles</option>
                <option value="50">Scan 50 profiles</option>
                <option value="100">Scan 100 profiles</option>
                <option value="250">Scan 250 profiles</option>
                <option value="500">Scan 500 profiles</option>
                <option value="1000">Scan 1000 profiles</option>
                <option value="2500">Scan 2500 profiles</option>
                <option value="5000">Scan 5000 profiles (Max)</option>
                <option value="custom">Custom amount...</option>
              </select>

              {isCustomCount && (
                <input
                  type="number"
                  min="1"
                  max="5000"
                  value={customCount}
                  onChange={(e) => setCustomCount(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-24 rounded-xl border border-emerald-500/40 bg-lp-graphite px-3 py-2 text-sm text-lp-white focus:border-emerald-500 focus:outline-none"
                />
              )}
            </div>
          </div>
        </div>

        {/* Preset Roles */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="flex items-center gap-1 text-xs text-lp-muted">
            <Sparkles className="h-3 w-3 text-emerald-400" /> Popular:
          </span>
          {PRESET_ROLES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setRole(preset)}
              className="rounded-lg border border-lp-border bg-lp-graphite px-2.5 py-1 text-xs text-lp-off-white transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Bulk Mode Notice */}
        {isBulkMode && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-300">
            <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              <strong>Bulk Search Enabled ({effectiveCount} profiles):</strong> Apollo searches multiple job-seeking phrases while keeping the selected role and location fixed. Results are not verified LinkedIn badges.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-100">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              id="otw-enrich-linkedin"
              type="checkbox"
              checked={enrichLinkedInUrls}
              onChange={(event) => setEnrichLinkedInUrls(event.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            Get LinkedIn URLs for the final matches
          </label>
          <select
            aria-label="LinkedIn URL enrichment limit"
            value={enrichLimit}
            disabled={!enrichLinkedInUrls}
            onChange={(event) => setEnrichLimit(event.target.value)}
            className="rounded-md border border-amber-500/30 bg-lp-graphite px-2 py-1 text-xs text-lp-white disabled:opacity-50"
          >
            <option value="25">First 25 matches</option>
            <option value="50">First 50 matches</option>
            <option value="100">First 100 matches</option>
          </select>
          <span className="text-amber-200/80">Optional paid Apollo enrichment; budget up to 1 credit per selected match. No email or phone is requested.</span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            id="otw-search-btn"
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isBulkMode
                  ? `Fetching & Scanning ${effectiveCount} Bulk Leads Across Pages…`
                  : "Searching Apollo profiles…"}
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Scan {effectiveCount} Profiles for Open To Work
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Results Table ─────────────────────────────────────────── */}
      {candidates && candidates.length > 0 && (
        <div className="rounded-2xl border border-lp-border bg-lp-panel p-6 shadow-sm space-y-4">
          {/* Table Header Controls */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-lp-white">
                Results for &ldquo;{role}&rdquo; ({candidates.length} Open To Work matches)
              </h2>
              <p className="text-xs text-lp-muted">
                Found {scanned.toLocaleString()} unique Apollo keyword-search results. {enrichedForLinkedInUrl > 0 ? `LinkedIn URL lookup requested for ${enrichedForLinkedInUrl.toLocaleString()} final matches.` : "LinkedIn URL lookup was not requested."}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Filter toggle */}
              <div className="flex items-center rounded-lg border border-lp-border bg-lp-graphite p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode("all");
                    setTablePage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    filterMode === "all"
                      ? "bg-emerald-600 font-medium text-white"
                      : "text-lp-muted hover:text-lp-white"
                  }`}
                >
                  Matches ({candidates.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode("otw");
                    setTablePage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    filterMode === "otw"
                      ? "bg-emerald-600 font-medium text-white"
                      : "text-lp-muted hover:text-lp-white"
                  }`}
                >
                  Open To Work ({openToWorkCount})
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    candidates,
                    role
                  )
                }
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                Export CSV ({openToWorkCount})
              </button>
              <button
                type="button"
                onClick={handleSearch}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-graphite px-3 py-1.5 text-xs font-medium text-lp-white transition-colors hover:border-lp-primary/40 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-lp-muted">
              <thead className="border-b border-lp-border text-xs uppercase text-lp-muted-dark">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">LinkedIn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lp-border">
                {pagedCandidates.map((c, i) => (
                  <tr
                    key={i}
                    className="transition-colors hover:bg-lp-graphite/40"
                  >
                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.isOpenToWork ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            <CheckCircle className="h-3 w-3" /> POSSIBLE OTW
                          </span>
                          {c.otwSignal && (
                            <span className="pl-0.5 text-[10px] text-lp-muted">
                              {SIGNAL_LABEL[c.otwSignal]}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                          <XCircle className="h-3 w-3" /> Not Open
                        </span>
                      )}
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 font-medium text-lp-white">
                      {c.name}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <div className="text-xs text-lp-off-white">{c.title}</div>
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3 text-xs">{c.location}</td>

                    {/* LinkedIn */}
                    <td className="px-4 py-3">
                      {c.linkedinUrl ? (
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-lp-primary hover:underline"
                        >
                          Profile <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-lp-muted">Unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-lp-border pt-4 text-xs text-lp-muted">
              <span>
                Showing {(tablePage - 1) * PAGE_SIZE + 1}–
                {Math.min(tablePage * PAGE_SIZE, displayedCandidates.length)} of{" "}
                {displayedCandidates.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                  className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-graphite px-2.5 py-1 text-xs text-lp-off-white transition-colors hover:border-lp-primary/40 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <span className="text-lp-white">
                  Page {tablePage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                  disabled={tablePage === totalPages}
                  className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-graphite px-2.5 py-1 text-xs text-lp-off-white transition-colors hover:border-lp-primary/40 disabled:opacity-30"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
