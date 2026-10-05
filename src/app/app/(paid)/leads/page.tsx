"use client";

import { useEffect, useState } from "react";
import { LeadDataTable } from "@/components/app/LeadDataTable";
import { AUTH_SESSION_CHANGED } from "@/components/auth/AuthSessionSync";

export default function AllLeadsPage() {
  const [leads, setLeads] = useState<unknown[]>([]);

  async function loadLeads() {
    const res = await fetch("/api/leads", { cache: "no-store" });
    if (res.status === 401) {
      setLeads([]);
      return;
    }
    const d = await res.json();
    setLeads(d.leads || []);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    const onSessionChange = () => {
      setLeads([]);
      void loadLeads();
    };
    window.addEventListener(AUTH_SESSION_CHANGED, onSessionChange);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED, onSessionChange);
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All saved leads</h1>
        <div className="flex items-center gap-4">
          <a href="/api/export/csv" className="text-sm text-electric hover:underline">Export all CSV</a>
          <a href="/api/export/csv?format=ats" className="text-sm text-electric hover:underline">
            Export all for ATS
          </a>
        </div>
      </div>
      <LeadDataTable leads={leads as never[]} />
    </div>
  );
}
