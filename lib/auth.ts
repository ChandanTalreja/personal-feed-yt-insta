import { createHash } from "crypto";
import { cookies } from "next/headers";

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
