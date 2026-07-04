import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { AUTH_COOKIE, authEnabled, authToken } from "@/lib/auth";
import { loginAttempts } from "@/lib/schema";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Hash both sides to equal-length buffers, then compare in constant time —
// a plain === leaks how many leading characters matched via response timing.
function passwordsMatch(input: string, secret: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authEnabled()) {
    return NextResponse.json({ ok: true });
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  const ip = clientIp(req);
  const db = await getDb();

  // Rate limit BEFORE touching the password: max 5 failures per IP per
  // window. The count lives in Postgres because serverless instances
  // share no memory.
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const [{ failures }] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, ip),
        gte(loginAttempts.attemptedAt, windowStart)
      )
    );
  if (Number(failures) >= MAX_ATTEMPTS) {
    return NextResponse.json(
      {
        error: `Too many attempts — try again in ${WINDOW_MINUTES} minutes.`,
      },
      { status: 429 }
    );
  }

  if (!passwordsMatch(String(password ?? ""), process.env.APP_PASSWORD!)) {
    await db.insert(loginAttempts).values({ ip });
    // Opportunistic sweep so the table never grows unbounded.
    await db
      .delete(loginAttempts)
      .where(lt(loginAttempts.attemptedAt, new Date(Date.now() - 3_600_000)));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, authToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
