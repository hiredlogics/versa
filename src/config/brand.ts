/** Single source of truth for product branding, change name here only */
export const BRAND = {
  name: "VARSA",
  tagline: "From intent to qualified pipeline.",
  fullName: "VARSA",
  /** Logo wordmark: heavy white + accent split */
  wordmarkPrimary: "var",
  wordmarkAccent: "sa",
  /** URL-safe slug for exports, filenames, etc. */
  slug: "varsa",
  description:
    "VARSA turns rough prompts, saved ICP context, and buyer criteria into enriched, scored B2B leads ready for outreach.",
  shortDescription:
    "VARSA helps teams find, score, save, and revisit qualified leads using data enrichment and several AI models.",
  positioning:
    "VARSA turns business context and rough prompts into qualified, scored B2B leads.",
  headline: "Turn intent to qualified pipeline.",
  longTagline:
    "VARSA transforms rough prompts and saved ICP context into enriched, scored B2B leads ready for outreach.",
  onboardingHeadline: "Teach VARSA your ideal buyer.",
  onboardingSubheadline:
    "Saved buyer context helps VARSA interpret vague prompts and score leads against your ICP.",
  emptyStateHeadline: "Who should we find today?",
  billingSubheadline: "Manage your VARSA subscription and lead credits.",
  searchSteps: {
    understand: "VARSA is structuring your buyer intent.",
    extract: "Extracting search filters from your prompt.",
    search: "Searching for matching companies and decision makers.",
    decision: "Finding decision makers at target companies.",
    enrich: "Unlocking verified contact details.",
    score: "Scoring leads against your saved context.",
    save: "Saving qualified opportunities.",
  },
  colors: {
    black: "#030303",
    graphite: "#08080A",
    charcoal: "#101014",
    panel: "rgba(255,255,255,0.055)",
    panelStrong: "rgba(255,255,255,0.09)",
    border: "rgba(255,255,255,0.12)",
    borderStrong: "rgba(255,255,255,0.22)",
    white: "#FFFFFF",
    offWhite: "#F4F4F5",
    muted: "#A1A1AA",
    mutedDark: "#71717A",
    iceBlue: "#BBD7FF",
    coldBlue: "#7FB3FF",
    silver: "#D4D4D8",
    accentGlow: "rgba(187, 215, 255, 0.22)",
  },
} as const;
