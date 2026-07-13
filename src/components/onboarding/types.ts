export const INDUSTRY_SUGGESTIONS = [
  "SaaS",
  "Healthcare",
  "FinTech",
  "Ecommerce",
  "Real Estate",
  "Manufacturing",
  "Agencies",
  "Education",
];

export const TITLE_SUGGESTIONS = [
  "Founder",
  "CEO",
  "CTO",
  "COO",
  "VP Engineering",
  "Head of Operations",
  "Head of Product",
  "Director of Engineering",
];

export const EXCLUDED_TITLE_SUGGESTIONS = [
  "Intern",
  "Student",
  "Recruiter",
  "Software Engineer",
  "Sales Rep",
  "Assistant",
  "Coordinator",
];

export const BUYING_SIGNAL_SUGGESTIONS = [
  "Hiring engineering team",
  "Recently funded",
  "Manual operations",
  "Scaling team",
  "Legacy systems",
  "AI automation need",
  "Data integration need",
  "High support volume",
];

export const SERVICE_SUGGESTIONS = [
  "AI automation",
  "Custom software development",
  "Workflow automation",
  "AI agents",
  "Internal tools",
  "Data integrations",
  "CRM automation",
];

export interface OnboardingFormState {
  companyName: string;
  websiteUrl: string;
  businessDescription: string;
  targetMarket: string;
  mainOffer: string;
  targetIndustries: string[];
  targetCountries: string[];
  companySizeMin: number;
  companySizeMax: number;
  targetTitles: string[];
  targetSeniorities: string[];
  excludedIndustries: string[];
  excludedTitles: string[];
  preferredBuyingSignals: string[];
  highQualityLeadNotes: string;
  badLeadNotes: string;
  preferredOutreachAngle: string;
  servicesToSell: string[];
  minLeadScore: number;
}

export const defaultOnboardingState: OnboardingFormState = {
  companyName: "",
  websiteUrl: "",
  businessDescription: "",
  targetMarket: "",
  mainOffer: "",
  targetIndustries: [],
  targetCountries: ["United States"],
  companySizeMin: 20,
  companySizeMax: 500,
  targetTitles: [],
  targetSeniorities: [],
  excludedIndustries: [],
  excludedTitles: [],
  preferredBuyingSignals: [],
  highQualityLeadNotes: "",
  badLeadNotes: "",
  preferredOutreachAngle: "",
  servicesToSell: [],
  minLeadScore: 8,
};
