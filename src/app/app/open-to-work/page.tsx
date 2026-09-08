"use client";

import { useState } from "react";
import { UserCheck, Download, Loader2, Search, CheckCircle, MapPin, Briefcase, Mail, ExternalLink, Sparkles } from "lucide-react";

interface Candidate {
  name: string;
  title: string;
  company: string;
  location: string;
  email?: string;
  linkedinUrl: string;
  isOpenToWork: boolean;
  otwSignal?: "title" | "apify" | "both";
  checkedAt: string;
}

const PRESET_ROLES = [
  "React Developer",
  "Full Stack Engineer",
  "DevOps Engineer",
  "Account Executive",
  "Product Designer",
];

export default function OpenToWorkPage() {
  const [role, setRole] = useState("React Developer");
  const [location, setLocation] = useState("United States");
  const [count, setCount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  const downloadCsvFile = (list: Candidate[], targetRole: string) => {
    if (!list || list.length === 0) return;
    const headers = [
      "Candidate Name",
      "Job Title",
      "Current Company",
      "Location",
      "Email Address",
      "LinkedIn Profile URL",
      "Open To Work (Apify Verified)",
      "Checked Date",
    ];
    const escapeCsv = (str: string | undefined | null) => {
      if (!str) return '""';
      return `"${String(str).replace(/"/g, '""')}"`;
    };
    const rows = list.map((c) => [
      escapeCsv(c.name),
      escapeCsv(c.title),
      escapeCsv(c.company),
      escapeCsv(c.location),
      escapeCsv(c.email),
      escapeCsv(c.linkedinUrl),
      escapeCsv(c.isOpenToWork ? "YES (Open To Work)" : "NO"),
      escapeCsv(c.checkedAt.split("T")[0]),
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    const cleanRole = targetRole.toLowerCase().replace(/[^a-z0-9]/g, "-");
    a.download = `open-to-work-${cleanRole}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSearchAndDownload = async () => {
    if (!role.trim()) {
      setError("Please enter a role or skill to search.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // 1. Single API call to search Apollo + verify with Apify
      const jsonRes = await fetch("/api/open-to-work/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, location, count: Number(count), format: "json" }),
      });

      const jsonData = await jsonRes.json();
      if (!jsonRes.ok) {
        throw new Error(jsonData.error || "Search failed");
      }

      const list = jsonData.candidates || [];
      setCandidates(list);

      // 2. Direct CSV download instantly from the fresh verified data
      if (list.length > 0) {
        downloadCsvFile(list, role);
      } else {
        setError("No candidates found for this query. Try a different role or location.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-lp-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-lp-white md:text-2xl">
              LinkedIn Open To Work Candidate Finder & CSV Exporter
            </h1>
            <p className="text-sm text-lp-muted">
              Search by role & location — Apify verifies real <span className="text-emerald-400 font-medium">#OpenToWork</span> status and exports directly to CSV.
            </p>
          </div>
        </div>
      </div>

      {/* Search Filter Composer */}
      <div className="rounded-2xl border border-lp-border bg-lp-panel p-6 shadow-sm space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Role Input */}
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-xs font-medium text-lp-off-white flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-lp-primary" /> Target Role / Title
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. React Developer"
              className="w-full rounded-xl border border-lp-border bg-lp-graphite px-3 py-2 text-sm text-lp-white placeholder-lp-muted-dark focus:border-lp-primary focus:outline-none"
            />
          </div>

          {/* Location Input */}
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-xs font-medium text-lp-off-white flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-lp-primary" /> Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. United States, Germany, Remote"
              className="w-full rounded-xl border border-lp-border bg-lp-graphite px-3 py-2 text-sm text-lp-white placeholder-lp-muted-dark focus:border-lp-primary focus:outline-none"
            />
          </div>

          {/* Count Selector */}
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-xs font-medium text-lp-off-white">Number of Candidates</label>
            <select
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-full rounded-xl border border-lp-border bg-lp-graphite px-3 py-2 text-sm text-lp-white focus:border-lp-primary focus:outline-none"
            >
              <option value="5">5 Candidates</option>
              <option value="10">10 Candidates</option>
              <option value="25">25 Candidates</option>
              <option value="50">50 Candidates</option>
            </select>
          </div>
        </div>

        {/* Quick Preset Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-lp-muted flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-emerald-400" /> Popular:
          </span>
          {PRESET_ROLES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setRole(preset)}
              className="rounded-lg border border-lp-border bg-lp-graphite px-2.5 py-1 text-xs text-lp-off-white hover:border-emerald-500/40 hover:text-emerald-300 transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSearchAndDownload}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Finding Candidates & Verifying with Apify...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Find Open To Work Candidates (Download CSV)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Table Preview */}
      {candidates && candidates.length > 0 && (
        <div className="rounded-2xl border border-lp-border bg-lp-panel p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-lp-white">
                Discovered Candidates for &ldquo;{role}&rdquo;
              </h2>
              <p className="text-xs text-lp-muted">
                CSV file downloaded to your computer. Here is the live preview:
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                {candidates.filter((c) => c.isOpenToWork).length} / {candidates.length} Open To Work
              </span>
              <button
                type="button"
                onClick={() => downloadCsvFile(candidates, role)}
                className="flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-graphite px-3 py-1.5 text-xs font-medium text-lp-white hover:border-emerald-500/40 hover:text-emerald-300 transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                Download CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-lp-muted">
              <thead className="border-b border-lp-border text-xs uppercase text-lp-muted-dark">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Role & Company</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">LinkedIn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lp-border">
                {candidates.map((c, i) => (
                  <tr key={i} className="hover:bg-lp-graphite/40 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      {c.isOpenToWork ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="h-3 w-3" /> OPEN TO WORK
                          </span>
                          <span className="text-[10px] text-lp-muted pl-0.5">
                            {c.otwSignal === "both" ? "✓ Title + Apify" : c.otwSignal === "apify" ? "✓ Apify" : "✓ Title/Headline"}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                          Not Open
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-lp-white">{c.name}</td>
                    <td className="py-3 px-4">
                      <div className="text-xs text-lp-off-white">{c.title}</div>
                      <div className="text-[11px] text-lp-muted">{c.company}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">{c.location}</td>
                    <td className="py-3 px-4 text-xs text-lp-off-white font-mono flex items-center gap-1">
                      <Mail className="h-3 w-3 text-lp-muted" /> {c.email}
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-lp-primary hover:underline"
                      >
                        Profile <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
