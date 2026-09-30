"use client";

import Link from "next/link";
import { Geist_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import { useState } from "react";
import { Check, ChevronDown, Menu, X } from "lucide-react";
import { BRAND } from "@/config/brand";
import type { CheckoutPlanSlug } from "@/lib/billing/constants";
import { PricingPlanButton } from "./PricingPlanButton";
import styles from "./HomeV2.module.css";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--home-font-ui" });
const newsreader = Newsreader({ subsets: ["latin"], weight: "500", variable: "--home-font-display" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--home-font-mono" });

const steps = [
  ["01", "Describe your buyer", "Write who you want to reach in plain language."],
  ["02", "Review the matches", "See a focused list of people and companies that fit."],
  ["03", "Prioritize the right people", "Use scores and reasons to decide where to start."],
  ["04", "Take the next step", "Save your context and return when you are ready."],
];
const features = [
  ["Ranked 1–10", "See the strongest matches first, with a clear score for every lead."],
  ["Explained, not a black box", "Every recommendation includes a concise reason it fits your buyer."],
  ["Verified contacts", "Start with contact details you can use with confidence."],
  ["Saved context", "Keep your buyer definition close so each new search starts smarter."],
];
const useCases = [
  ["Founder-led sales", "Build an early, focused list of buyers without losing time to research."],
  ["Outbound teams", "Give reps a ranked starting point for thoughtful outreach."],
  ["Agencies", "Find the right decision-makers for each client engagement."],
  ["Market research", "Explore new audiences and see who matches a new point of view."],
];
const plans: Array<{ name: string; price: string; desc: string; features: string[]; cta: string; planSlug?: CheckoutPlanSlug; highlight?: boolean }> = [
  { name: "Free Trial", price: "$0", desc: "A focused way to try VARSA.", features: ["25 leads each month", "3 searches each month", "Ranked results", "CSV export"], cta: "Start free" },
  { name: "Starter", price: "$49", desc: "For individuals building pipeline.", features: ["500 leads each month", "50 searches each month", "AI lead scoring", "CSV and Excel export"], cta: "Choose Starter", planSlug: "starter" },
  { name: "Pro", price: "$149", desc: "For teams that prospect every day.", features: ["2,500 leads each month", "250 searches each month", "Advanced scoring", "Saved lead lists"], cta: "Choose Pro", planSlug: "pro", highlight: true },
  { name: "Agency", price: "$399", desc: "For teams serving multiple clients.", features: ["10,000 leads each month", "1,000 searches each month", "Team workspace", "Priority support"], cta: "Choose Agency", planSlug: "agency" },
];
const faqs = [
  ["What does VARSA do?", "VARSA turns a description of your buyer into a ranked list of B2B leads, with a clear reason for every match."],
  ["How do I start?", "Describe the people and companies you want to reach, then review the ranked results and decide where to focus."],
  ["What does the score mean?", "Scores run from 1–10 and help you compare fit. The explanation beside each score gives the useful context."],
  ["Are contacts verified?", "Results label verified email availability so you can quickly understand what is ready for outreach."],
  ["Can I save my buyer context?", "Yes. VARSA keeps your buyer context available for your next search."],
  ["Is there a free trial?", "Yes. The free trial includes 25 leads and 3 searches per month. Upgrade whenever you need more."],
];

function HomeNav() {
  const [open, setOpen] = useState(false);
  const links = [["#how", "How it works"], ["#use-cases", "Use cases"], ["#pricing", "Pricing"], ["#faq", "FAQ"]] as const;
  return <header className={styles.nav}><div className={styles.navInner}><Link href="/" className={styles.wordmark} aria-label={`${BRAND.name} home`}>{BRAND.name}</Link><nav className={styles.desktopNav} aria-label="Main navigation">{links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</nav><div className={styles.navActions}><Link href="/login">Sign in</Link><Link className={styles.primaryButton} href="/register">Start free</Link></div><button className={styles.menuButton} type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div>{open && <div className={styles.drawer} aria-label="Mobile navigation"><nav>{links.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}<Link href="/login" onClick={() => setOpen(false)}>Sign in</Link><Link className={styles.primaryButton} href="/register" onClick={() => setOpen(false)}>Start free</Link></nav></div>}</header>;
}

function SampleResults() {
  const people = [["Maya Chen", "Founder", "Northstar", "Building a sales team", "9.6"], ["Daniel Brooks", "VP Revenue", "Crescent", "Hiring for growth", "9.2"], ["Priya Shah", "COO", "Fieldwork", "Owns the buying motion", "8.9"], ["Aaron Miller", "CEO", "Relay", "Matches company profile", "8.6"]];
  return <aside className={styles.sampleCard} aria-label="Sample results"><div className={styles.cardLabel}>Sample results</div><div className={styles.prompt}><span>Buyer description</span><p>Founders and revenue leaders at growing B2B software companies.</p></div><div className={styles.leads}>{people.map(([name, title, company, reason, score]) => <div className={styles.lead} key={name}><div><strong>{name}</strong><p>{title} · {company}</p><small>{reason}</small></div><div className={styles.score}><span>Verified email</span><b>{score}</b></div></div>)}</div></aside>;
}

export function HomeV2() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return <div className={`${styles.homeV2} ${instrument.variable} ${newsreader.variable} ${mono.variable}`}><HomeNav /><section className={styles.hero}><div className={styles.heroCopy}><p className={styles.eyebrow}>B2B lead intelligence</p><h1>Describe your buyer. Get a ranked list.</h1><p className={styles.lede}>Turn a clear point of view into a practical list of people to contact. VARSA ranks each lead and explains why it belongs there.</p><div className={styles.heroActions}><Link className={styles.primaryButton} href="/register">Start finding leads</Link><a className={styles.secondaryButton} href="#how">See how it works</a></div><p className={styles.trialNote}>Start free with 25 leads and 3 searches each month.</p></div><SampleResults /></section><section id="how" className={styles.section}><p className={styles.eyebrow}>How it works</p><h2>From a point of view to a list you can use.</h2><div className={styles.steps}>{steps.map(([number, title, desc]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{desc}</p></article>)}</div></section><section className={`${styles.section} ${styles.tinted}`}><p className={styles.eyebrow}>What you get</p><h2>Useful signals, kept simple.</h2><div className={styles.features}>{features.map(([title, desc]) => <article key={title}><span>+</span><h3>{title}</h3><p>{desc}</p></article>)}</div></section><section id="use-cases" className={styles.section}><p className={styles.eyebrow}>Use cases</p><h2>For teams with a clear next customer.</h2><div className={styles.useCases}>{useCases.map(([title, desc]) => <Link key={title} href="/use-cases"><h3>{title}</h3><p>{desc}</p><span>Explore use cases →</span></Link>)}</div></section><section id="pricing" className={`${styles.section} ${styles.tinted}`}><p className={styles.eyebrow}>Pricing</p><h2>Choose room to grow.</h2><p className={styles.sectionLead}>Start with the free trial. Change plans whenever your work calls for more.</p><div className={styles.pricing}>{plans.map((plan) => <article className={plan.highlight ? styles.featuredPlan : styles.plan} key={plan.name}>{plan.highlight && <span className={styles.popular}>Most popular</span>}<h3>{plan.name}</h3><p>{plan.desc}</p><div className={styles.price}>{plan.price}<small>/month</small></div><ul>{plan.features.map((feature) => <li key={feature}><Check aria-hidden />{feature}</li>)}</ul><PricingPlanButton planSlug={plan.planSlug} cta={plan.cta} highlight={plan.highlight} className={styles.pricingButton} /></article>)}</div></section><section id="faq" className={styles.section}><p className={styles.eyebrow}>FAQ</p><h2>Questions, answered plainly.</h2><div className={styles.faqs}>{faqs.map(([question, answer], index) => <article key={question}><h3><button type="button" aria-expanded={openFaq === index} aria-controls={`faq-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{question}<ChevronDown aria-hidden className={openFaq === index ? styles.rotated : undefined} /></button></h3><div id={`faq-${index}`} hidden={openFaq !== index}><p>{answer}</p></div></article>)}</div></section><section className={styles.finalCta}><p className={styles.eyebrow}>Ready when you are</p><h2>Find the people worth talking to next.</h2><p>Bring your point of view. Leave with a ranked, explained starting point.</p><Link className={styles.lightButton} href="/register">Start finding leads</Link></section><footer className={styles.footer}><Link className={styles.wordmark} href="/">{BRAND.name}</Link><p>{BRAND.tagline}</p><nav aria-label="Footer navigation"><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/use-cases">Use cases</Link><Link href="/contact">Privacy</Link><Link href="/contact">Terms</Link><Link href="/contact">Contact</Link></nav><small>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</small></footer></div>;
}
