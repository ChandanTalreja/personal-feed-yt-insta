import { createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const AUTH_COOKIE = "pf_auth";

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

export function authToken(): string {
  return createHash("sha256")
    .update(process.env.APP_PASSWORD ?? "")
    .digest("hex");
}

export async function isAuthed(): Promise<boolean> {
  if (!authEnabled()) return true;
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value === authToken();
}

/** The reply for an API call that isn't logged in. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * For API routes: the 401 reply when the caller isn't logged in, else null.
 *   const denied = await denyUnlessAuthed();
 *   if (denied) return denied;
 */
export async function denyUnlessAuthed(): Promise<NextResponse | null> {
  return (await isAuthed()) ? null : unauthorized();
}
