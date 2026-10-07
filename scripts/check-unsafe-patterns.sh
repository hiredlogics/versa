#!/usr/bin/env bash
#
# THE ABSENCE RULE
#
#   An empty result is evidence. A missing value is absence of evidence.
#   They must never land on the same branch.
#
# Every instance of this bug so far had the same shape, a comparison or a
# default where the absent case and the legitimate-zero case were
# indistinguishable, so "we don't know" quietly became a confident answer:
#
#   1. A locked usage row that wasn't there  -> `rows[0]?.leadsUsed ?? 0` read as
#      "nothing spent", so every concurrent reserve saw a full balance.
#   2. A page count that wasn't there        -> `nextPage <= null` is `1 <= 0`,
#      false, so a search with pages remaining reported itself exhausted.
#   3. A survivor count of zero              -> "no matches on this page" and
#      "request fulfilled" both reserved nothing and both looked terminal.
#
# The tell is always the same. Prefer throwing on absent over defaulting, and
# make the reason part of the return type.
#
#   Corollary: where absence is legitimate, say what it means at that point,
#   explicitly. A default decides for you, and silently.
#
#     `?? 0` decided that a missing usage row meant nothing had been spent.
#     `nextPage <= null` decided that missing metadata meant no pages remained.
#     A stripped JSON key decided that `undefined` meant `false`.
#
#   Each was one line, each looked reasonable, each was wrong.
#
# THE NO-ARTIFACT RULE
#
#   Don't create a record for something that didn't happen.
#
# A refund that nets to zero, a FAILED search for a request that never started,
# a settled hold for work never attempted, each leaves a trace the user or the
# next engineer has to interpret, and each is indistinguishable from the real
# event it imitates. Applied so far:
#
#   * Zero survivors returns before reserving, so there is no hold to settle.
#   * Tests assert holds.size === 0 rather than a balanced refund, because a
#     correct balance can be reached by an expensive wrong path.
#   * fulfilled / exhausted / no_matches_this_pass stay distinct even though all
#     three reserve nothing.
#   * A user with no credits gets a 402 and no LeadSearch row, rather than a
#     FAILED row indistinguishable from a search that genuinely broke.
#
# CI guard for the classes of bug we have already been bitten by.
#
#   1. Raw SQL comparing a DateTime column to a bound JS Date. periodStart and
#      friends are `timestamp without time zone`; a Date binds as timestamptz and
#      is shifted by the session offset, so the predicate matches zero rows. A
#      FOR UPDATE built that way locks nothing and reads as "no usage".
#   2. Permissive defaults in code that gates spending or access, where a missing
#      value must never resolve to "proceed".
set -uo pipefail
cd "$(dirname "$0")/.."

status=0

echo "== raw SQL against timestamp columns =="
if rg -n --pcre2 'Prisma\.sql`[^`]*"(periodStart|periodEnd|createdAt|updatedAt|deletedAt|settledAt)"\s*(=|<|>|<=|>=)\s*\$\{' src/ ; then
  echo "FAIL: compare timestamps through the Prisma client, or lock by primary key."
  status=1
else
  echo "ok"
fi

echo
echo "== permissive defaults in credit/quota paths =="
# Sites that are genuinely reporting rather than authorising carry an explicit
# `safe-default:` comment, so silence is always a deliberate decision.
if rg -n '(\?\?\s*0|\|\|\s*0)' src/lib/pipeline/credits.ts src/lib/services/billing/ 2>/dev/null \
  | rg -v 'safe-default:|remaining|pending|_sum|_avg|_count|percent|Used \?\? 0'; then
  echo "FAIL: a missing value must not default to the permissive answer here."
  echo "      If the site only reports, mark it with a // safe-default: comment."
  status=1
else
  echo "ok"
fi

echo
echo "== vendor name inside src/lib/pipeline =="
# Rule, no exceptions to remember: nothing in src/lib/pipeline/ mentions the
# vendor. The one unavoidable case is the Lead.apolloPersonId database column,
# which carries an explicit // vendor-name: marker until Phase 10 renames it.
if rg -in 'apollo' src/lib/pipeline/ | rg -v 'vendor-name:'; then
  echo "FAIL: use the provider-neutral name here; vendor names belong in src/lib/apollo.ts."
  status=1
else
  echo "ok"
fi

exit $status
