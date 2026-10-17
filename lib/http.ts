import { NextResponse } from "next/server";

/**
 * A database id from the URL (`/api/videos/42`): a positive whole number, or
 * null for anything else ("abc", "4.5", "-1"), so a bad address gets a clean
 * 400 instead of reaching the database as NaN.
 */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The reply for an id that isn't one. */
export function badId(): NextResponse {
  return NextResponse.json({ error: "Invalid id." }, { status: 400 });
}
