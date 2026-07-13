import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
  {
    slug: "free-trial",
    name: "Free Trial",
    leadsPerMonth: 25,
    searchesPerMonth: 3,
    features: { scoring: "basic", export: ["csv"] },
  },
  {
    slug: "starter",
    name: "Starter",
    leadsPerMonth: 500,
    searchesPerMonth: 50,
    features: { scoring: "ai", export: ["csv", "xlsx"], history: true },
  },
  {
    slug: "pro",
    name: "Pro",
    leadsPerMonth: 2500,
    searchesPerMonth: 250,
    features: {
      scoring: "advanced",
      export: ["csv", "xlsx"],
      history: true,
      savedLists: true,
      priorityAi: true,
    },
  },
  {
    slug: "agency",
    name: "Agency",
    leadsPerMonth: 10000,
    searchesPerMonth: 1000,
    features: {
      scoring: "advanced",
      export: ["csv", "xlsx"],
      history: true,
      savedLists: true,
      priorityAi: true,
      multiUser: true,
      adminAnalytics: true,
    },
  },
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        leadsPerMonth: plan.leadsPerMonth,
        searchesPerMonth: plan.searchesPerMonth,
        features: plan.features,
        stripePriceId:
          plan.slug === "starter"
            ? process.env.STRIPE_PRICE_STARTER || null
            : plan.slug === "pro"
              ? process.env.STRIPE_PRICE_PRO || null
              : plan.slug === "agency"
                ? process.env.STRIPE_PRICE_AGENCY || null
                : null,
      },
      create: {
        slug: plan.slug,
        name: plan.name,
        leadsPerMonth: plan.leadsPerMonth,
        searchesPerMonth: plan.searchesPerMonth,
        features: plan.features,
        stripePriceId:
          plan.slug === "starter"
            ? process.env.STRIPE_PRICE_STARTER || null
            : plan.slug === "pro"
              ? process.env.STRIPE_PRICE_PRO || null
              : plan.slug === "agency"
                ? process.env.STRIPE_PRICE_AGENCY || null
                : null,
      },
    });
  }

  console.log("Seeded plans:", plans.map((p) => p.slug).join(", "));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
