# LeadPilot AI — Project Structure

Industry-standard layout for this Next.js 15 App Router SaaS.

```
ES/
├── docs/
│   └── ARCHITECTURE.md          # This file
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── seed.ts                  # Seed data
├── public/                      # Static assets
├── src/
│   ├── app/                     # Next.js App Router (routes only)
│   │   ├── (auth)/              # Auth route group — login, register, SSO
│   │   ├── (marketing)/         # Public marketing — landing, pricing, contact
│   │   ├── admin/               # Admin dashboard (protected)
│   │   ├── app/                 # Main product workspace (protected)
│   │   ├── api/                 # Route handlers (REST)
│   │   ├── layout.tsx           # Root HTML shell, fonts, theme script
│   │   └── globals.css          # Tailwind entry
│   ├── components/
│   │   ├── auth/                # Auth UI (forms, shell, OAuth)
│   │   ├── brand/               # Logo, mark
│   │   ├── marketing/           # Landing & marketing sections
│   │   ├── app/                 # In-app product UI
│   │   ├── providers/           # Client providers (Clerk, etc.)
│   │   ├── theme/               # Theme bootstrap script
│   │   └── ui/                  # Shared primitives (Button, Input, Card)
│   ├── config/
│   │   └── brand.ts             # Brand name & metadata constants
│   ├── lib/
│   │   ├── auth/                # Auth helpers & validation
│   │   ├── contact/             # Contact form validation
│   │   ├── db/                  # Prisma client
│   │   ├── services/            # Domain services (AI, billing, leads)
│   │   ├── theme/               # Theme persistence helpers
│   │   └── utils/               # Shared utilities (cn, etc.)
│   └── styles/
│       └── tokens.css           # Design tokens, theme variables, utilities
├── middleware.ts                # Clerk auth + route protection
├── next.config.ts               # Next.js config, security headers
└── package.json
```

## Conventions

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Routes | `src/app/**/page.tsx` | Compose UI, no business logic |
| API | `src/app/api/**/route.ts` | HTTP handlers, validate, call services |
| Services | `src/lib/services/**` | Business logic, external APIs |
| UI | `src/components/**` | Presentational & client interactivity |
| Config | `src/config/**` | App-wide constants (brand, feature flags) |
| Auth | `src/lib/auth/**` + middleware | Session, roles, Zod schemas |

## Theme

- `data-theme="dark" | "light"` on `<html>`
- Tokens in `src/styles/tokens.css` (`--color-lp-*`)
- Toggle: marketing navbar + auth shell (top-right)
- Preference: `localStorage` key `lp-theme`

## Route groups

- `(marketing)` — public, no Clerk JS on initial load
- `(auth)` — Clerk provider, login/register flows
- `app/` — authenticated product
- `admin/` — admin-only
