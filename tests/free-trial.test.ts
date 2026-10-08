import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type User } from "@prisma/client";
import {
  LeadSearchAccessError,
  incrementUsage,
  requireLeadSearchAccess,
  usagePeriodFor,
} from "@/lib/services/billing/usageLimits";
import { FREE_TRIAL_PERIOD } from "@/lib/billing/planLimits";
import { getPostAuthRedirectPath, isOnFreeTrial } from "@/lib/billing/subscription";
import { getFullBillingStatus } from "@/lib/billing/billingDashboard";

const prisma = new PrismaClient();
const previousEnforce = process.env.BILLING_ENFORCE;

let user: User;
let starterPlanId: string;

beforeAll(async () => {
  process.env.BILLING_ENFORCE = "true";
  await prisma.plan.upsert({
    where: { slug: "free-trial" },
    update: {},
    create: { slug: "free-trial", name: "Free Trial", leadsPerMonth: 25, searchesPerMonth: 3, features: {} },
  });
  const starter = await prisma.plan.upsert({
    where: { slug: "starter" },
    update: {},
    create: { slug: "starter", name: "Starter", leadsPerMonth: 500, searchesPerMonth: 50, features: {} },
  });
  starterPlanId = starter.id;
});

beforeEach(async () => {
  user = await prisma.user.create({
    data: {
      clerkId: `trial-test-${crypto.randomUUID()}`,
      email: `trial-test-${crypto.randomUUID()}@example.com`,
    },
  });
});

afterEach(async () => {
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
});

afterAll(async () => {
  if (previousEnforce === undefined) delete process.env.BILLING_ENFORCE;
  else process.env.BILLING_ENFORCE = previousEnforce;
  await prisma.$disconnect();
});

async function accessError(requested: number): Promise<LeadSearchAccessError> {
  try {
    await requireLeadSearchAccess(user, requested);
  } catch (error) {
    if (error instanceof LeadSearchAccessError) return error;
    throw error;
  }
  throw new Error("Expected the search to be refused");
}

describe("free trial with billing enforced", () => {
  it("lets a user with no plan search, capped at 25 leads", async () => {
    const access = await requireLeadSearchAccess(user, 100);

    expect(access.plan.slug).toBe("free-trial");
    expect(access.effectiveMaxLeads).toBe(25);
    expect(access.searchesRemaining).toBe(3);
  });

  it("does not hand out Starter limits for a checkout that was never paid", async () => {
    await prisma.subscription.create({
      data: { userId: user.id, planId: starterPlanId, status: "INCOMPLETE", planName: "Starter" },
    });

    const access = await requireLeadSearchAccess(user, 100);
    expect(access.plan.slug).toBe("free-trial");
    expect(access.effectiveMaxLeads).toBe(25);
  });

  it("blocks further searches once the 25 leads are used", async () => {
    await requireLeadSearchAccess(user, 25);
    await incrementUsage(user.id, 25, 1);

    expect((await accessError(10)).code).toBe("LEAD_LIMIT_REACHED");
  });

  it("blocks a fourth search, ever", async () => {
    for (let i = 0; i < 3; i++) {
      await requireLeadSearchAccess(user, 1);
      await incrementUsage(user.id, 1, 1);
    }

    expect((await accessError(1)).code).toBe("SEARCH_LIMIT_REACHED");
  });

  it("is a one-time allowance that never resets", async () => {
    const january = usagePeriodFor(null, new Date(Date.UTC(2026, 0, 15)));
    const july = usagePeriodFor(null, new Date(Date.UTC(2027, 6, 15)));
    expect(january.start.getTime()).toBe(FREE_TRIAL_PERIOD.start.getTime());
    expect(july.start.getTime()).toBe(january.start.getTime());

    await requireLeadSearchAccess(user, 25);
    await incrementUsage(user.id, 25, 1);

    const records = await prisma.usageRecord.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(1);
    expect(records[0].periodStart.getTime()).toBe(FREE_TRIAL_PERIOD.start.getTime());
    expect(records[0].leadsUsed).toBe(25);
  });

  it("keeps a paying user on their own plan", async () => {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: starterPlanId,
        status: "ACTIVE",
        planName: "Starter",
        stripeSubscriptionId: `sub_test_${crypto.randomUUID()}`,
        currentPeriodStart: new Date(Date.UTC(2030, 0, 1)),
        currentPeriodEnd: new Date(Date.UTC(2030, 1, 1)),
      },
    });

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(isOnFreeTrial(subscription)).toBe(false);

    const access = await requireLeadSearchAccess(user, 100);
    expect(access.plan.slug).toBe("starter");
    expect(access.effectiveMaxLeads).toBe(100);
  });

  it("sends a new user to onboarding, not to pricing", async () => {
    expect(await getPostAuthRedirectPath(user)).toBe("/onboarding");
  });

  it("shows the free trial as the current plan on the billing page", async () => {
    const status = await getFullBillingStatus(user.id);

    expect(status.displayPlanName).toBe("Free Trial");
    expect(status.isActive).toBe(true);
    expect(status.usage.leadsLimit).toBe(25);
    expect(status.availablePlans.every((plan) => !plan.isCurrent)).toBe(true);
  });
});
