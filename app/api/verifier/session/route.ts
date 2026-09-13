import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { queryOne } from "@/lib/db";
import { issueTokens } from "@/lib/api-tokens";
import { isAdminEmail } from "@/lib/admin";
import { isProduction } from "@/lib/deploy-env";

// POST /api/verifier/session   { email, secret }
//
// VLT-36 — the verifier door. Signs an EXISTING account in without the sign-in
// form, so an unattended acceptance verifier can work checks on staging. The
// studio's convention (NIU-669), the same triple gate as MRE's
// /api/e2e/test-login and ChoreKid's /api/verifier/session:
//
//   1. REFUSED IN PRODUCTION, whatever secret is presented — decided before the
//      secret is even read, so a correct secret on production learns nothing.
//   2. 403 when VERIFIER_SECRET is unset, so a non-production deploy nobody gave
//      a secret is shut rather than open.
//   3. Constant-time compare.
//
// What it returns is the ordinary session, twice over: the NextAuth session
// cookie a browser sign-in sets (so a headless browser can drive the web app),
// and the native access + refresh tokens /api/auth/token issues (so an API
// client or the iOS app can). It creates no account and grants admin to nobody
// — admin comes from ADMIN_EMAILS exactly as it does for a real sign-in.
//
// Excluded from the auth middleware (see middleware.ts) because the caller has
// no session yet; every gate lives here.

export const runtime = "nodejs";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sameSecret(presented: string, configured: string): boolean {
  // Hash both to a fixed length first. timingSafeEqual throws on unequal
  // lengths, and a throw would turn "wrong length" into a 500 that tells a
  // caller how long the configured secret is.
  const a = crypto.createHash("sha256").update(presented, "utf8").digest();
  const b = crypto.createHash("sha256").update(configured, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

interface Body {
  email?: string;
  secret?: string;
}

export async function POST(req: NextRequest) {
  // ── Gate 1 — production, regardless of the secret ─────────────────────────
  if (isProduction()) {
    return NextResponse.json(
      {
        error: "verifier door is not available in production",
        detail:
          "This door signs an account in without the sign-in flow and is refused in production " +
          "whatever secret is presented (VLT-36). Use Vault 1 staging, where DEPLOY_ENV=staging.",
      },
      { status: 403 },
    );
  }

  // ── Gate 2 — no secret configured ────────────────────────────────────────
  const configured = process.env.VERIFIER_SECRET;
  if (!configured) {
    return NextResponse.json(
      {
        error: "verifier door is not configured",
        detail: "VERIFIER_SECRET is unset, so this door is shut even outside production.",
      },
      { status: 403 },
    );
  }

  // ── Gate 3 — constant-time compare ───────────────────────────────────────
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const header = req.headers.get("authorization") ?? "";
  const presented = body.secret || (header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "");
  if (!presented || !sameSecret(presented, configured)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // THE ACCOUNT MUST ALREADY EXIST. This door skips the sign-in flow; it does
  // not manufacture users.
  const user = await queryOne<{ id: string; email: string; name: string | null; image: string | null }>(
    "SELECT id, email, name, image FROM users WHERE email = $1",
    [email],
  );
  if (!user) {
    return NextResponse.json(
      {
        error: "no such account",
        detail: "This door signs in an EXISTING account and does not create one. Register it first.",
      },
      { status: 404 },
    );
  }

  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    return NextResponse.json({ error: "NEXTAUTH_SECRET is not set" }, { status: 500 });
  }

  const admin = isAdminEmail(user.email);

  // The native pair, through the same issueTokens /api/auth/token uses.
  const tokens = await issueTokens({
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: admin,
    client: "niu-verifier",
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for") || null,
  });

  // The browser session: the JWT NextAuth itself writes for the credentials
  // provider, carrying the claims lib/auth.ts's callbacks read.
  const sessionToken = await encode({
    token: {
      name: user.name,
      email: user.email,
      picture: user.image,
      sub: user.id,
      userId: user.id,
      isAdmin: admin,
    },
    secret: nextAuthSecret,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const cookieName = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const res = NextResponse.json({
    ...tokens,
    user: { id: user.id, email: user.email, name: user.name, image: user.image, isAdmin: admin },
    session_cookie: cookieName,
  });
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
