# LeadPilot AI

Premium B2B lead finder SaaS — natural language prompts, Apollo enrichment, multi-provider AI scoring, Stripe billing.

## Stack

- **Next.js 15** App Router + TypeScript + Tailwind CSS 4
- **Clerk** authentication
- **Prisma** + PostgreSQL
- **Stripe** subscriptions
- **Apollo.io** people search
- **AI fallback chain:** OpenAI → Groq → Gemini → Claude

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in Clerk keys, Apollo key, and at least one AI key
# For Docker Postgres: see "Database (Docker)" below

# 3. Database
npx prisma migrate dev --name init
npx prisma db seed

# 4. Run
npm run dev
```

### Database (Docker)

Run PostgreSQL in Docker (port **5434** on host — avoids clash with local Postgres on 5432):

```bash
npm run db:up
```

Add this to `.env.local`:

```bash
DATABASE_URL=postgresql://leadpilot:leadpilot@localhost:5434/leadpilot?schema=public
```

Apply schema and seed:

```bash
npx prisma migrate deploy
npm run db:seed
```

Other commands:

| Command | Action |
|---------|--------|
| `npm run db:up` | Start Postgres container |
| `npm run db:down` | Stop container |
| `npm run db:reset` | Wipe volume, migrate, seed |
| `npm run db:logs` | Follow Postgres logs |
| `npm run db:studio` | Open Prisma Studio |

Credentials and port overrides: see `.env.docker.example`.

Open [http://localhost:3000](http://localhost:3000) for the marketing site.  
Sign up and go to `/app` for the lead finder dashboard.

## Routes

| Area | Routes |
|------|--------|
| Marketing | `/`, `/pricing`, `/features`, `/use-cases`, `/contact` |
| Auth | `/login`, `/signup` |
| App | `/app`, `/app/searches`, `/app/leads`, `/app/billing`, `/app/settings` |
| Admin | `/admin` (requires `UserRole.ADMIN` in database) |

## API

- `POST /api/leads/find` — run a lead search
- `GET /api/searches` — search history
- `GET /api/export/csv?searchId=...` — CSV export
- `POST /api/stripe/checkout` — Stripe checkout
- `POST /api/stripe/webhook` — Stripe webhooks
- `POST /api/webhooks/clerk` — Clerk user sync

## Tests

```bash
npm test
```

## Deployment

1. Create Neon/Supabase PostgreSQL database
2. Deploy to Vercel with all env vars from `.env.example`
3. Run `npx prisma migrate deploy` in CI
4. Configure Clerk webhook → `/api/webhooks/clerk`
5. Configure Stripe webhook → `/api/stripe/webhook`

## Admin access

Set a user's role to `ADMIN` in the database:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
```

Or set Clerk `publicMetadata.role` to `"ADMIN"` on user creation via webhook.

## Legacy prototype

The original single-user chat UI and JSON file storage remain under `/api/chat` and `/data/` for reference. The SaaS app uses `/app` and PostgreSQL.
# versa
