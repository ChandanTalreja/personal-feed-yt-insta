import { NextResponse } from "next/server";
import { TrackError } from "@/lib/tracks";

/** Turn a thrown error into the right HTTP response for the tracks routes.
 *  (Not a route: only files named route.ts become endpoints.) */
export function trackErrorResponse(err: unknown) {
  if (err instanceof TrackError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json({ error: (err as Error).message }, { status: 500 });
}
