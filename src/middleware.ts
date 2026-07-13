import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/features(.*)",
  "/use-cases(.*)",
  "/contact(.*)",
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

    await auth.protect();
  },
  {
    // Dev machines often drift a few seconds behind Clerk; default 5s is too tight.
    clockSkewInMs: 12000,
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|css|js)$).*)",
    "/(api|trpc)(.*)",
  ],
};
