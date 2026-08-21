# VARSA — Software Requirements Specification (SRS) & Scope

| Field | Value |
|---|---|
| **Product** | VARSA (codebase: `cludly` / formerly LeadPilot AI) |
| **Document** | Scope + Software Requirements Specification |
| **Version** | 2.0 |
| **Status** | As-built (current Next.js + Prisma + Apollo implementation) |
| **Audience** | Product, engineering, operations |
| **Related** | `docs/ARCHITECTURE.md`, `prisma/schema.prisma`, `src/config/brand.ts` |

---

## 1. Purpose

VARSA is a B2B lead-finding SaaS. A user types a natural-language prompt (who they want to reach). The system:

1. Interprets the prompt into Apollo people-search filters.
2. Fetches matching people from **Apollo.io** (the only people/email data source).
3. Unlocks emails in sequential batches, keeps only leads with a usable email.
4. Scores leads and writes a short “Why Reach Out” note.
5. Saves results so the user can browse, resume a partial search, and export.

**Positioning:** “From intent to qualified pipeline.”

This document defines **in-scope**, **out-of-scope**, functional requirements, non-functional requirements, users, data, and external dependencies for the current product.

---

## 2. Problem statement

Sales and recruiting teams need lists of named people (title, company, location, email) that match a described ICP. Manual LinkedIn/Apollo UI work is slow. VARSA automates:

- Prompt → structured filters
- Paginated Apollo pull
- Credit-aware email unlock
- Persistence, progress, and export

**Hard constraint:** Apollo is the sole discovery and email-unlock provider. There is no scraping, no LinkedIn harvest, and no free unlimited lead source.

---

## 3. Scope

### 3.1 In scope (current product)

| Area | What is included |
|---|---|
| Marketing site | Landing, features, use cases, pricing, contact |
| Auth | Clerk sign-up / sign-in, session protection, Clerk webhook user sync |
| Onboarding | Saved ICP / buyer context (`UserLeadContext`) |
| Lead finder | Chat-style prompt composer, async search job, live progress |
| Search history | List searches, open a search, paginate 200 leads, stop / resume |
| Lead table | Score, email, LinkedIn, Why Reach Out, page enrich |
| Export | CSV / Excel of saved leads |
| Billing | Stripe checkout, portal, usage limits (when `BILLING_ENFORCE=true`) |
| Admin | Users, plans, API keys, API health, searches, usage, audit |
| Reliability | Sequential ~1,000-lead batches, `_progress` resume, honest error/progress states |

### 3.2 Out of scope (explicit)

| Item | Reason |
|---|---|
| Web scraping / unofficial LinkedIn harvest | Not allowed; not part of this product |
| Sending outreach emails or sequences | VARSA stores context (“Why Reach Out”) only; it is not a mailer |
| Native “open to work” Apollo filter | Apollo People Search has no such API; VARSA discloses this and tightens titles/location/keywords |
| Unlimited free leads | All people search + email reveal consume **Apollo credits** |
| Multi-tenant team workspaces (full) | Agency plan lists “team workspace” as a feature flag; not a full org model in schema |
| Alternate people databases (PDL, ZoomInfo, Hunter as finder) | Not implemented; Hunter-style email-only fill is also not implemented |

### 3.3 Future / optional (not committed)

- CSV import of customer-owned lists (score/export without Apollo discovery)
- Second enrichment provider for email-only fill after people are already identified
- Team seats / shared searches
- CRM push (HubSpot, Salesforce)

---

## 4. Users and permissions

| Actor | How they access | Capabilities |
|---|---|---|
| **Anonymous visitor** | Marketing routes | View product pages, submit contact form |
| **Authenticated user** | `/app/*` after Clerk login | Onboarding, search, view own leads, export, billing, settings |
| **Subscriber** | Same + Stripe status `ACTIVE` / `TRIALING` when billing is enforced | Run searches within plan caps |
| **Admin** | `/admin/*` (`UserRole.ADMIN` or Clerk `publicMetadata.role`) | Users, plans, API keys, health, usage, audit |

Data isolation: leads and searches are scoped to `userId`. Users cannot see another user’s searches.

---

## 5. Product modules

### 5.1 Prompt interpretation

- **Primary:** AI parse (`parsePromptWithAi`) with Zod validation.
- **Fallback:** Heuristic parse if AI JSON is invalid or AI is down.
- Output: `SearchCriteria` including Apollo filters (`personTitles`, `personLocations`, `qKeywords`, `employeeRanges`, `includeSimilarTitles`) plus `openToWork`, exclusions, intent text.

**Open-to-work rule:** Not sent as an Apollo boolean. Titles/location/keywords stay tight; UI states that open-to-work cannot be verified directly (without naming the provider). Optional title-text signals (`#OpenToWork`, etc.) may filter **before** email unlock.

**Clarification gate:** Before any credits are spent, `POST /api/leads/find` parses the prompt and — when location, role, or requested count is missing/ambiguous (`src/lib/clarifyPrompt.ts`) — returns `status: "NEEDS_CLARIFICATION"` with 1–3 questions and remaining lead credits. **No `LeadSearch` row is created.** The chat shows the questions; the user's next message runs with `skipClarification: true`.

### 5.2 Apollo search & unlock

- Search: `POST /mixed_people/api_search`
- Unlock: `POST /people/bulk_match` (max 10 people per call), `reveal_personal_emails`
- Job loop (per batch of `LEAD_PROCESS_BATCH_SIZE`, default **100**): **fetch → score → unlock highest score first → keep usable email → save → update `_progress` → stop**
- `LEAD_MAX_AUTO_BATCHES=1`: one batch per user action. The UI then offers **“Get next 100”** (Resume) instead of draining the plan in one click.
- `maxLeadsThisRun` clamps each run to `min(batch size, remaining plan credits, requested count)`
- No parallel batches; resume starts at the next incomplete page/batch
- Apollo 422 insufficient credits: stop unlock immediately (do not 10× single-match retry)

### 5.2.1 Provider naming

Client `/app` UI never names Apollo. Copy uses brand-neutral wording (“lead search”, “data provider”, match pool). Apollo naming stays in server logs, `/admin`, env vars, and marketing pages.

### 5.3 Scoring & Why Reach Out

- Heuristic scoring by default (`SCORING_MODE`); optional AI scoring with provider fallback: OpenAI → Groq → Gemini → Claude → heuristic
- **Why**: 1–2 sentences on why this specific person is worth contacting, persisted on `Lead.reasoning`. It is outreach **context**, never a drafted email, subject line, or greeting.

### 5.4 Persistence & UI

- `LeadSearch` + `Lead` in PostgreSQL
- Progress stored on `LeadSearch.apolloFilters._progress`
- Chat polls `GET /api/searches/:id`; table shows saved leads after each batch
- Results table shows only **Name · Why · Email · LinkedIn**; deeper fields stay in the lead drawer and exports
- Poll timeout must not display “Search failed” while the job is still running

### 5.5 Billing & usage

Plans (seed / `PLAN_LIMITS`):

| Plan | Leads / month | Searches / month |
|---|---|---|
| Free Trial | 25 | 3 |
| Starter | 500 | 50 |
| Pro | 2,500 | 250 |
| Agency | 10,000 | 1,000 |

`BILLING_ENFORCE=false` (typical local): subscription and monthly caps are not enforced.

**Note:** App plan “lead credits” are **not** Apollo.io credits. Exhausting Apollo credits blocks email unlock even if the VARSA plan still has quota.

`/app/usage` shows current plan, period reset date, leads/searches used vs remaining, how many 100-lead batches the remaining credits cover, and simple activity totals (searches run, leads saved, share with verified email, average score) from `getUsageAnalytics`.

---

## 6. Functional requirements

### FR-1 Authentication

- FR-1.1 Users must sign in via Clerk to access `/app` and protected APIs.
- FR-1.2 Unauthenticated `/api/*` (except public webhooks/contact) return **401 JSON**, not a fake 404 HTML rewrite.
- FR-1.3 Clerk webhook creates/updates `User` (`clerkId`, email).

### FR-2 Onboarding

- FR-2.1 User can save ICP context (industries, countries, titles, exclusions, offer).
- FR-2.2 Incomplete onboarding may block search (`OnboardingRequiredError` → 403).
- FR-2.3 Prompt-only mode (`USE_LEAD_CONTEXT=false`) must not blend ICP into Apollo filters.

### FR-3 Lead search

- FR-3.1 `POST /api/leads/find` creates a `RUNNING` search and returns immediately (`async: true`).
- FR-3.1a If the prompt is missing location, role, or count, the endpoint instead returns `NEEDS_CLARIFICATION` with questions and creates no search row, so no credits are consumed.
- FR-3.2 Background job paginates Apollo and processes sequential batches (default **100**, one batch per user action).
- FR-3.2a Each run is clamped to remaining plan credits; within a batch, emails are unlocked in descending `leadScore` order so the best matches get credits first.
- FR-3.3 Only leads with a **usable unlocked email** are saved (`isUsableEmail`; placeholders like `email_not_unlocked` discarded).
- FR-3.4 User can **Stop** a running search and continue with **Get next 100** (Resume) from stored `_progress`.
- FR-3.5 Progress copy reports checked vs pool vs with-email (e.g. `1,076 / 3,576,776 checked → 0 with valid email`).
- FR-3.6 Permanent failure after retries sets `FAILED`. In-progress or poll timeout uses “still processing”, not “Search failed”.

### FR-4 Results

- FR-4.1 Lead table pages in 200-row windows and shows Name, Why, Email, LinkedIn.
- FR-4.2 User can export CSV/Excel of saved leads.
- FR-4.3 Soft-delete of leads/searches (`deletedAt`).
- FR-4.4 No client-facing `/app` copy names the underlying data provider.

### FR-5 Billing

- FR-5.1 Stripe checkout for Starter / Pro / Agency.
- FR-5.2 Webhook updates subscription status and plan.
- FR-5.3 When billing is enforced, searches respect monthly lead and search caps.
- FR-5.4 `/app/usage` shows plan, remaining lead/search credits, batches remaining, and activity totals.

### FR-6 Admin

- FR-6.1 Admin can view users, searches, usage, API health, and configure encrypted API keys.
- FR-6.2 Sensitive actions write `AdminAuditLog`.

---

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Next.js 15 App Router, TypeScript, Prisma, PostgreSQL |
| NFR-2 | Security headers (frame, nosniff, HSTS, referrer) in `next.config.ts` |
| NFR-3 | API keys stored encrypted (`ApiKeyConfig`); Apollo/AI keys never committed |
| NFR-4 | Sequential unlock to stay within Apollo bulk_match (10) and credit safety |
| NFR-5 | Vercel Hobby `maxDuration` 300s; job continues via `after()`; resume for remaining pages |
| NFR-6 | Structured logs (`scope: lead-fetch`) for parse, fetch, unlock, batch complete |
| NFR-7 | Clock skew tolerance for Clerk JWTs in development (`clockSkewInMs`) |
| NFR-8 | User data isolated by `userId`; no cross-tenant lead access |

---

## 8. External systems

```
User browser
    → Next.js (Clerk middleware)
        → PostgreSQL (Prisma)
        → Apollo.io  (people search + email reveal)   [required for new leads]
        → OpenAI / Groq / Gemini / Claude             [parse + optional score/why]
        → Stripe                                      [optional, billing]
        → Clerk                                       [identity]
```

| System | Used for | Failure impact |
|---|---|---|
| Apollo.io | Find people, unlock emails | No new leads with email |
| AI providers | Parse prompt, score, Why | Heuristic fallback |
| Clerk | Auth | Cannot use app |
| Stripe | Paid plans | Local can disable via `BILLING_ENFORCE` |
| PostgreSQL | All durable state | App down |

---

## 9. Data model (summary)

| Entity | Role |
|---|---|
| `User` | Clerk-linked account, role |
| `UserLeadContext` | ICP / onboarding |
| `Plan` / `Subscription` | Entitlements |
| `UsageRecord` | Monthly leads/searches used |
| `LeadSearch` | One prompt job; filters, status, `_progress` |
| `Lead` | Saved person with email, score, reasoning |
| `SavedLeadList` | Named lists of leads |
| `AiProviderLog` / `ApolloApiLog` | Ops diagnostics |
| `ExportLog` / `AdminAuditLog` | Export and admin audit |

Lead fields persisted: name, title, company, industry, employees, location, email, LinkedIn URL, score, priority, reasoning, `apolloPersonId`, raw Apollo JSON.

---

## 10. Key user journeys

### 10.1 Happy path

1. Sign up → complete onboarding (optional if context ignored).
2. Open `/app`, enter prompt (e.g. “software engineers in New York looking for a job”).
3. Receive `RUNNING` + poll progress.
4. After each batch, table shows unlocked-with-email leads.
5. Status `COMPLETE`; export CSV if needed.
6. If partial (time / batch cap / credits), click **Resume**.

### 10.2 Apollo credits exhausted

1. Search finds people; first `bulk_match` returns 422 insufficient credits.
2. Unlock stops; search completes with honest message.
3. User tops up credits in **Apollo** (app.apollo.io → Settings → Plans), then Resume or re-run.

### 10.3 Broad “open to work” prompt

1. System does **not** claim Apollo filtered job-seekers.
2. Filters use real titles + location + keywords; similar-titles off for OTW.
3. Disclaimer shown in intent / summary.

---

## 11. APIs (product)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/leads/find` | Start async search |
| GET | `/api/searches` | History |
| GET | `/api/searches/[id]` | Search + paged leads |
| POST | `/api/searches/[id]/stop` | Stop running job |
| POST | `/api/searches/[id]/resume` | Resume partial pull |
| POST | `/api/searches/[id]/enrich-page` | Enrich current 200-row page |
| GET | `/api/leads` | User leads |
| GET | `/api/export/csv` / `/api/export/excel` | Export |
| POST | `/api/onboarding/context` | Save ICP |
| POST | `/api/stripe/checkout` | Subscribe |
| POST | `/api/stripe/webhook` | Stripe events |
| POST | `/api/webhooks/clerk` | User sync |
| POST | `/api/contact` | Marketing contact |

Legacy `/api/chat` JSON-file path is not the SaaS product path.

---

## 12. Environment (required vs optional)

**Required for lead search:** `DATABASE_URL`, Clerk keys, `APOLLO_API_KEY`, at least one AI key (or heuristic-only parse).

**Important Apollo-related:** `APOLLO_REVEAL_PERSONAL_EMAILS`, `LEAD_PROCESS_BATCH_SIZE` (default 1000), `LEAD_MAX_AUTO_BATCHES`, `UNLOCK_BATCH_TIMEOUT_MS`.

**Optional:** Stripe keys + `BILLING_ENFORCE`, `USE_LEAD_CONTEXT`.

---

## 13. Success criteria

The product is successful when:

1. A signed-in user can describe a buyer in one prompt and receive a saved list of **named people with usable emails**.
2. Large Apollo pools do not unlock “everything at once”; batches of 1,000 complete sequentially and remain resumable.
3. UI never reports “Search failed” while the job is still running.
4. Open-to-work / job-seeker language does not silently produce a multi-million unfiltered pool.
5. Apollo credit exhaustion is visible and recoverable (Resume after top-up).
6. Users only see their own data; billing (when on) enforces plan caps.

---

## 14. Assumptions and constraints

1. Apollo.io contract and credits are the customer’s (or operator’s) responsibility.
2. Email reveal costs Apollo lead credits; VARSA cannot invent emails.
3. Apollo search results do not include emails until enrich/unlock.
4. “Open to work” is a user intent, not an Apollo people-search parameter.
5. Deployment target: Vercel (or equivalent) + hosted Postgres (Neon/Supabase/Docker).
6. No scraping of third-party sites is in this specification and must not be added as a substitute for Apollo.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Prompt** | Natural-language description of who to find |
| **ICP** | Ideal customer profile saved in onboarding |
| **Unlock** | Apollo match/enrich that reveals a personal or work email |
| **Usable email** | Non-empty, not a placeholder (`email_not_unlocked`, etc.) |
| **Batch** | Sequential unit of ~1,000 Apollo people: fetch → unlock → save |
| **`_progress`** | JSON on `LeadSearch.apolloFilters` for resume |
| **Why Reach Out** | Stored reasoning text for the user, not a sent email |

---

*End of SRS. This document describes the as-built VARSA lead-finder SaaS as implemented in this repository.*
