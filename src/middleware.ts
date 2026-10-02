import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/features(.*)",
  "/use-cases(.*)",
  "/contact(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/login(.*)",
  "/register(.*)",
  "/signup(.*)",
  "/forgot-password(.*)",
  "/sso-callback(.*)",
  "/auth/continue(.*)",
  "/billing/cancel(.*)",
  "/api/contact(.*)",
  "/api/stripe/webhook(.*)",
  "/api/webhooks/clerk(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req) || isAdminRoute(req)) {
      return;
    }

    // API routes: return 401 JSON instead of Clerk's protect-rewrite → fake 404 HTML.
    // (auth.protect() intentionally 404s unauthenticated session-token API requests.)
    if (req.nextUrl.pathname.startsWith("/api/")) {
      const session = await auth();
      if (!session.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return;
    }

    await auth.protect();
  },
  {
    // Dev machines often drift behind Clerk's token iat (seen ~15–30s locally).
    // Default 5s / prior 12s is too tight and causes session_expired + refresh loops.
    clockSkewInMs: 60_000,
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|css|js)$).*)",
    "/(api|trpc)(.*)",
  ],
};
