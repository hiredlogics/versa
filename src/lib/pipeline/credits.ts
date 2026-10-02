import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ACTIVE_SUBSCRIPTION_STATUSES, isBillingEnforced } from "@/lib/billing/constants";
import { PLAN_LIMITS } from "@/lib/billing/planLimits";

/**
 * Credits are deducted before paid work and settled afterwards: charged for what
 * was delivered, released for the rest. The invariant every operation preserves:
 *
 *   UsageRecord.leadsUsed === SUM(charged of settled holds) + SUM(amount of HELD holds)
 */

export class InsufficientCreditsError extends Error {
  readonly remaining: number;
  readonly requested: number;

  constructor(remaining: number, requested: number) {
    super(`Not enough lead credits: ${requested} requested, ${remaining} remaining.`);
    this.name = "InsufficientCreditsError";
    this.remaining = remaining;
    this.requested = requested;
  }
}

export interface CreditBalance {
  planName: string;
  limit: number;
  used: number;
  remaining: number;
  /** Reserved but not yet settled — in-flight, not spent. */
  pending: number;
  periodStart: Date;
  periodEnd: Date;
}

type Tx = Prisma.TransactionClient;

function calendarPeriod(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

interface ResolvedPlan {
  start: Date;
  end: Date;
  limit: number;
  planName: string;
}

/**
 * Period and limit come from the subscription when there is one. Billing being
 * switched off is a development convenience, not a free unlimited plan, so it
 * falls back to the starter allowance rather than zero.
 */
async function resolvePlan(tx: Tx, userId: string, now: Date): Promise<ResolvedPlan> {
  const subscription = await tx.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  const active =
    Boolean(subscription) &&
    ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription!.status);

  const fallback = calendarPeriod(now);

  // Without an active paid plan the user is on the free trial, counted per calendar month.
  if (isBillingEnforced() && !active) {
    return {
      start: fallback.start,
      end: fallback.end,
      limit: PLAN_LIMITS.freeTrial.monthlyLeads,
      planName: PLAN_LIMITS.freeTrial.name,
    };
  }

  const start = subscription?.currentPeriodStart ?? fallback.start;
  const end = subscription?.currentPeriodEnd ?? fallback.end;

  return {
    start,
    end,
    limit: subscription?.plan.leadsPerMonth ?? PLAN_LIMITS.starter.monthlyLeads,
    planName: subscription?.plan.name ?? PLAN_LIMITS.starter.name,
  };
}

async function lockHold(tx: Tx, holdId: string) {
  // Locking first is what makes the status check idempotent. Without it two
  // concurrent releases both read HELD and both refund.
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      status: string;
      amount: number;
      charged: number | null;
      userId: string;
      periodStart: Date;
    }>
  >(
    Prisma.sql`SELECT id, status, amount, charged, "userId", "periodStart"
               FROM "CreditHold" WHERE id = ${holdId} FOR UPDATE`
  );
  return rows[0] ?? null;
}

export async function reserve(input: {
  userId: string;
  searchId: string;
  amount: number;
  idempotencyKey: string;
}) {
  const { userId, searchId, amount, idempotencyKey } = input;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.creditHold.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;

      const plan = await resolvePlan(tx, userId, new Date());

      // FOR UPDATE cannot lock a row that does not exist, so guarantee it first.
      // upsert() is SELECT-then-INSERT and loses this race; createMany compiles
      // to INSERT ... ON CONFLICT DO NOTHING, which is atomic.
      await tx.usageRecord.createMany({
        data: [{ userId, periodStart: plan.start, periodEnd: plan.end }],
        skipDuplicates: true,
      });

      const usage = await tx.usageRecord.findUnique({
        where: { userId_periodStart: { userId, periodStart: plan.start } },
        select: { id: true },
      });
      if (!usage) {
        throw new Error(`Usage row missing for ${userId} @ ${plan.start.toISOString()}`);
      }

      // Lock by primary key, never by (userId, periodStart). periodStart is
      // `timestamp without time zone`; a JS Date binds as timestamptz and gets
      // shifted by the session offset, so that predicate matches zero rows —
      // locking nothing and reading leadsUsed as 0, which lets every concurrent
      // reserve believe the balance is full.
      const rows = await tx.$queryRaw<Array<{ leadsUsed: number }>>(
        Prisma.sql`SELECT "leadsUsed" FROM "UsageRecord" WHERE id = ${usage.id} FOR UPDATE`
      );

      const locked = rows[0];
      if (!locked) {
        throw new Error(`Failed to lock usage row ${usage.id}`);
      }

      const used = locked.leadsUsed;
      const remaining = Math.max(0, plan.limit - used);

      if (amount > remaining) {
        throw new InsufficientCreditsError(remaining, amount);
      }

      await tx.usageRecord.update({
        where: { userId_periodStart: { userId, periodStart: plan.start } },
        data: { leadsUsed: { increment: amount } },
      });

      return tx.creditHold.create({
        data: {
          userId,
          searchId,
          amount,
          status: "HELD",
          idempotencyKey,
          periodStart: plan.start,
        },
      });
    });
  } catch (error) {
    // Same key raced past the read above: the unique constraint is the
    // enforcement, so hand back the hold that won.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.target ?? "").includes("idempotencyKey")
    ) {
      const winner = await prisma.creditHold.findUnique({ where: { idempotencyKey } });
      if (winner) return winner;
    }
    throw error;
  }
}

export async function commit(
  holdId: string,
  used: number
): Promise<{ charged: number; refunded: number }> {
  return prisma.$transaction(async (tx) => {
    const hold = await lockHold(tx, holdId);
    if (!hold) return { charged: 0, refunded: 0 };
    if (hold.status !== "HELD") {
      return { charged: hold.charged ?? 0, refunded: 0 }; // safe-default: reports a settled hold, authorises nothing
    }

    const charged = Math.max(0, Math.min(Math.trunc(used), hold.amount));
    const refunded = hold.amount - charged;

    if (refunded > 0) {
      await tx.usageRecord.update({
        where: { userId_periodStart: { userId: hold.userId, periodStart: hold.periodStart } },
        data: { leadsUsed: { decrement: refunded } },
      });
    }

    await tx.creditHold.update({
      where: { id: holdId },
      data: { status: "CHARGED", charged, settledAt: new Date() },
    });

    return { charged, refunded };
  });
}

export async function release(holdId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const hold = await lockHold(tx, holdId);
    if (!hold || hold.status !== "HELD") return 0;

    await tx.usageRecord.update({
      where: { userId_periodStart: { userId: hold.userId, periodStart: hold.periodStart } },
      data: { leadsUsed: { decrement: hold.amount } },
    });

    await tx.creditHold.update({
      where: { id: holdId },
      data: { status: "RELEASED", charged: 0, settledAt: new Date() },
    });

    return hold.amount;
  });
}

export async function balance(userId: string): Promise<CreditBalance> {
  const plan = await resolvePlan(prisma, userId, new Date());

  const usage = await prisma.usageRecord.findUnique({
    where: { userId_periodStart: { userId, periodStart: plan.start } },
  });

  const pending = await prisma.creditHold.aggregate({
    where: { userId, status: "HELD" },
    _sum: { amount: true },
  });

  const used = usage?.leadsUsed ?? 0;

  return {
    planName: plan.planName,
    limit: plan.limit,
    used,
    remaining: Math.max(0, plan.limit - used),
    pending: pending._sum.amount ?? 0,
    periodStart: plan.start,
    periodEnd: plan.end,
  };
}

/**
 * A killed serverless function leaves its hold HELD forever, locking credits the
 * user never spent. Run this on a schedule.
 */
export async function releaseStale(olderThanMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

  const stale = await prisma.creditHold.findMany({
    where: { status: "HELD", createdAt: { lt: cutoff } },
    select: { id: true },
  });

  let released = 0;
  for (const hold of stale) {
    try {
      // Another worker may have settled it between the query and now; release()
      // re-checks under a row lock, so a loser here simply refunds nothing.
      if ((await release(hold.id)) > 0) released += 1;
    } catch (error) {
      console.warn(
        `[credits] releaseStale skipped ${hold.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return released;
}
