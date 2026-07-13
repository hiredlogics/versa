export const MARKETING_COLORS = {
  background: "#05070D",
  backgroundSoft: "#090D16",
  panel: "rgba(255,255,255,0.06)",
  panelStrong: "rgba(255,255,255,0.1)",
  border: "rgba(255,255,255,0.12)",
  text: "#F8FAFC",
  muted: "#94A3B8",
  muted2: "#64748B",
  blue: "#60A5FA",
  violet: "#8B5CF6",
  cyan: "#22D3EE",
  emerald: "#34D399",
  amber: "#FBBF24",
} as const;

export const SAMPLE_LEADS = [
  { name: "Maya Chen", title: "Founder", company: "NovaStack", signal: "AI automation", score: 9.6, priority: "High" },
  { name: "Daniel Brooks", title: "CTO", company: "Vertex Labs", signal: "Scaling eng", score: 9.3, priority: "High" },
  { name: "Priya Shah", title: "VP Engineering", company: "PulseMetrics", signal: "Hiring surge", score: 9.1, priority: "High" },
  { name: "Aaron Miller", title: "CEO", company: "BrightPath AI", signal: "Series A", score: 8.9, priority: "Medium" },
] as const;

export const TRUST_LOGOS = ["NovaStack", "PulseMetrics", "Arcline", "Vertex Labs", "BrightPath", "SignalForge", "Northline"] as const;
