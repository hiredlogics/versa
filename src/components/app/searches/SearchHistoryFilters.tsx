"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import type {
  SearchDateFilter,
  SearchSortOption,
  SearchStatusFilter,
} from "@/lib/types/search-history";

interface SearchHistoryFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: SearchStatusFilter;
  onStatusFilterChange: (value: SearchStatusFilter) => void;
  dateFilter: SearchDateFilter;
  onDateFilterChange: (value: SearchDateFilter) => void;
  sort: SearchSortOption;
  onSortChange: (value: SearchSortOption) => void;
  resultCount: number;
}

export function SearchHistoryFilters({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  dateFilter,
  onDateFilterChange,
  sort,
  onSortChange,
  resultCount,
}: SearchHistoryFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-muted-dark" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by prompt…"
            className="app-input w-full py-2.5 !pl-10 !pr-4"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-lp-muted-dark">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </div>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as SearchStatusFilter)}
            className="app-input w-auto min-w-[120px] py-2 text-xs"
          >
            <option value="all">All statuses</option>
            <option value="complete">Complete</option>
            <option value="running">Running</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
            <option value="no_leads">No leads</option>
          </select>
          <select
            value={dateFilter}
            onChange={(e) => onDateFilterChange(e.target.value as SearchDateFilter)}
            className="app-input w-auto min-w-[120px] py-2 text-xs"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SearchSortOption)}
            className="app-input w-auto min-w-[140px] py-2 text-xs"
          >
            <option value="newest">Newest first</option>
            <option value="most_leads">Most leads</option>
            <option value="highest_score">Highest avg score</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-lp-muted-dark">
        {resultCount} search{resultCount !== 1 ? "es" : ""}
      </p>
    </div>
  );
}
