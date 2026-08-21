"use client";

import { X, Mail, ExternalLink, Building2, MapPin, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ScoreBadge } from "@/components/ui/Badge";
import { LeadSignalBadges } from "@/components/app/LeadSignalBadges";
import type { LeadRecord } from "@/lib/types/lead-finder";
import { priorityLabel } from "@/lib/types/lead-finder";

export function LeadDetailDrawer({
  lead,
  onClose,
}: {
  lead: LeadRecord | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Close lead details"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-lp-border bg-lp-graphite shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-lp-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-lp-white">{lead.name}</h2>
                <p className="text-sm text-lp-muted">{lead.title}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-lp-border p-2 text-lp-muted hover:text-lp-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <section className="flex items-center gap-3">
                <ScoreBadge score={lead.leadScore} />
                <span className="rounded-full border border-lp-border bg-lp-panel px-2.5 py-0.5 text-xs text-lp-muted">
                  {priorityLabel(lead.priorityLevel)} priority
                </span>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-lp-muted-dark">
                  Match signals
                </h3>
                <LeadSignalBadges lead={lead} />
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-lp-muted-dark">
                  Contact
                </h3>
                <InfoRow icon={Mail} label="Email">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="app-link">
                      {lead.email}
                    </a>
                  ) : (
                    "Not available"
                  )}
                </InfoRow>
                <InfoRow icon={ExternalLink} label="LinkedIn">
                  {lead.linkedinUrl ? (
                    <a
                      href={lead.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-link"
                    >
                      View profile
                    </a>
                  ) : (
                    "Not available"
                  )}
                </InfoRow>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-lp-muted-dark">
                  Company
                </h3>
                <InfoRow icon={Building2} label="Company">
                  {lead.company}
                </InfoRow>
                <InfoRow icon={Users} label="Employees">
                  {lead.employees ?? "Unknown"}
                </InfoRow>
                <InfoRow icon={MapPin} label="Location">
                  {lead.location ?? "Unknown"}
                </InfoRow>
                {lead.industry && (
                  <InfoRow icon={Building2} label="Industry">
                    {lead.industry}
                  </InfoRow>
                )}
              </section>

              {lead.reasoning && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-lp-muted-dark">
                    Why Reach Out
                  </h3>
                  <p className="rounded-lg border border-lp-border bg-lp-panel p-3 text-sm leading-relaxed text-lp-muted">
                    {lead.reasoning}
                  </p>
                </section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-lp-muted-dark" />
      <div>
        <p className="text-[11px] text-lp-muted-dark">{label}</p>
        <p className="text-lp-off-white">{children}</p>
      </div>
    </div>
  );
}
