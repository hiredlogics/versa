"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, Trash2, RefreshCw, Mail, Briefcase } from "lucide-react";
import LeadTable from "@/components/LeadTable";
import ExportButtons from "@/components/ExportButtons";
import type { ScoredLead } from "@/lib/types";
import Link from "next/link";
import clsx from "clsx";

type Filter = "all" | "email" | "openToWork";

export default function LeadsPage() {
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    setLoading(true);
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      setLeads(data.leads || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const filteredLeads = useMemo(() => {
    if (filter === "email") return leads.filter((l) => l.email);
    if (filter === "openToWork") return leads.filter((l) => l.openToWork);
    return leads;
  }, [leads, filter]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      withEmail: leads.filter((l) => l.email).length,
      openToWork: leads.filter((l) => l.openToWork).length,
    }),
    [leads]
  );

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead?")) return;
    await fetch(`/api/leads/delete?id=${id}`, { method: "DELETE" });
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleClearAll() {
    if (!confirm("Delete ALL saved leads? This cannot be undone.")) return;
    await fetch("/api/leads/delete?clearAll=true", { method: "DELETE" });
    setLeads([]);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Saved Leads
            </h1>
            <p className="text-sm text-gray-500">
              {stats.total} leads · {stats.withEmail} with email · {stats.openToWork} open to work
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLeads}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <ExportButtons disabled={filteredLeads.length === 0} />
            {leads.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")} label={`All (${stats.total})`} />
          <FilterTab
            active={filter === "email"}
            onClick={() => setFilter("email")}
            label={`With Email (${stats.withEmail})`}
            icon={<Mail className="w-3.5 h-3.5" />}
          />
          <FilterTab
            active={filter === "openToWork"}
            onClick={() => setFilter("openToWork")}
            label={`Open to Work (${stats.openToWork})`}
            icon={<Briefcase className="w-3.5 h-3.5" />}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center">
            <Users className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">
              {filter === "all" ? "No leads saved yet" : `No leads matching "${filter}" filter`}
            </p>
            <Link href="/app" className="mt-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
              Find Leads
            </Link>
          </div>
        ) : (
          <LeadTable leads={filteredLeads} showHistory onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
        active
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
