import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Edge-level gate for the app. Replaces the previous `withAuth` wrapper so
// that the iOS app's Bearer requests aren't bounced before the route handler
// can validate them.
//
// Rules:
// 1. Requests carrying `Authorization: Bearer …` always pass through.
//    The route handler authenticates via `lib/api-auth.getApiSession`,
//    which verifies the access JWT and falls back to cookie if needed.
// 2. Requests without a Bearer header must have a valid NextAuth session
//    cookie. If they don't:
//      - API routes get a JSON 401.
//      - Browser pages get a 302 to `/login?callbackUrl=…`.
//
// Public paths (login/register/auth callbacks/AASA/etc.) are excluded via
// the matcher below so the middleware never runs on them.

export async function middleware(req: NextRequest) {
  // Bearer-token path — let through; route handler does its own check.
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.next();
  }

  // NextAuth cookie path — same logic withAuth used internally.
  const token = await getToken({ req });
  if (token) {
    return NextResponse.next();
  }

  // Unauthenticated. API routes get a 401 JSON, browser pages get the
  // redirect-to-login flow we used to get from withAuth.pages.signIn.
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(loginUrl);
}

// Same exclusion list as the previous `withAuth` setup:
// - login/register/privacy: public pages (privacy must be reachable by eBay's
//   review + the OAuth consent screen without a Vault1 login).
// - api/auth: NextAuth's own routes (token, refresh, social, [...nextauth]).
// - api/status: Bearer probe — its handler does the auth check.
// - api/aasa + .well-known: Apple's CDN must fetch unauthenticated.
// - api/upload + api/data/import: large bodies; routes do their own checks.
// - api/pursuits/run-search + api/mgmt: separate auth (cron secret / mgmt token).
// - api/marketplace/ebay/account-deletion: eBay calls it unauthenticated; the
//   route validates via the shared verification-token hash.
// - api/verifier: the verifier door (VLT-36) — its caller has no session yet;
//   the route refuses in production and checks its own secret.
// - _next/static, _next/image, favicon, uploads: static assets.
export const config = {
  matcher: ["/((?!login|register|privacy|api/auth|api/status|api/aasa|\\.well-known|api/pursuits/run-search|api/mgmt|api/marketplace/ebay/account-deletion|api/verifier|api/upload|api/data/import|_next/static|_next/image|favicon\\.ico|uploads).*)"],
};
