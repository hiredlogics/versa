"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { SearchHistoryCard } from "@/components/app/searches/SearchHistoryCard";
import { SearchHistoryFilters } from "@/components/app/searches/SearchHistoryFilters";
import { SearchPreviewPanel } from "@/components/app/searches/SearchPreviewPanel";
import {
  SearchHistoryEmpty,
  SearchHistoryError,
  SearchHistorySkeleton,
} from "@/components/app/searches/SearchHistoryStates";
import { AUTH_SESSION_CHANGED } from "@/components/auth/AuthSessionSync";
import type {
  SearchDateFilter,
  SearchHistoryItem,
  SearchSortOption,
  SearchStatusFilter,
} from "@/lib/types/search-history";

function filterByDate(searches: SearchHistoryItem[], filter: SearchDateFilter) {
  if (filter === "all") return searches;
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return searches.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
}

function sortSearches(searches: SearchHistoryItem[], sort: SearchSortOption) {
  const copy = [...searches];
  if (sort === "most_leads") {
    return copy.sort((a, b) => b.totalQualified - a.totalQualified);
  }
  if (sort === "highest_score") {
    return copy.sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
  }
  return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function SearchHistoryPage() {
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SearchStatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<SearchDateFilter>("all");
  const [sort, setSort] = useState<SearchSortOption>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadSearches = useCallback(async () => {
    setLoading(true);
    setError(false);
    setSignedOut(false);
    try {
      const res = await fetch("/api/searches", { cache: "no-store" });
      if (res.status === 401) {
        setSearches([]);
        setSignedOut(true);
        return;
      }
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSearches(data.searches ?? []);
      setSelectedId(null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSearches();
  }, [loadSearches]);

  useEffect(() => {
    const onSessionChange = () => {
      setSearches([]);
      setSelectedId(null);
      void loadSearches();
    };
    window.addEventListener(AUTH_SESSION_CHANGED, onSessionChange);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED, onSessionChange);
  }, [loadSearches]);

  const filtered = useMemo(() => {
    let result = filterByDate(searches, dateFilter);

    if (statusFilter !== "all") {
      result = result.filter((s) => s.displayStatus === statusFilter);
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter((s) => s.prompt.toLowerCase().includes(q));
    }

    return sortSearches(result, sort);
  }, [searches, dateFilter, statusFilter, query, sort]);

  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8"
    >
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-lp-white md:text-3xl">
            Search history
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-lp-muted">
            Review past lead searches, reopen conversations, or inspect saved leads.
          </p>
        </div>
        <Link
          href="/app"
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-lp-white px-5 py-2.5 text-sm font-medium text-lp-black transition-opacity hover:opacity-90 lg:self-auto"
        >
          <Plus className="h-4 w-4" />
          New search
        </Link>
      </header>

      {!loading && !error && searches.length > 0 && (
        <div className="mb-6">
          <SearchHistoryFilters
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            sort={sort}
            onSortChange={setSort}
            resultCount={filtered.length}
          />
        </div>
      )}

      {loading && <SearchHistorySkeleton />}

      {error && !loading && <SearchHistoryError onRetry={loadSearches} />}

      {!loading && !error && signedOut && <div className="app-panel rounded-3xl p-10 text-center"><p className="text-sm text-lp-muted">Sign in to see your searches</p><Link href="/login" className="mt-4 inline-flex rounded-xl bg-lp-white px-4 py-2 text-sm font-medium text-lp-black">Sign in</Link></div>}
      {!loading && !error && !signedOut && searches.length === 0 && <SearchHistoryEmpty />}

      {!loading && !error && searches.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="app-panel rounded-3xl p-10 text-center">
                <p className="text-sm text-lp-muted">No searches match your filters.</p>
              </div>
            ) : (
              filtered.map((search, index) => (
                <SearchHistoryCard
                  key={search.id}
                  search={search}
                  index={index}
                  selected={selected?.id === search.id}
                  onSelect={() => setSelectedId(search.id)}
                />
              ))
            )}
          </div>
          <SearchPreviewPanel search={selected} />
        </div>
      )}
    </motion.div>
  );
}
