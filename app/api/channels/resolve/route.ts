import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAuthed } from "@/lib/auth";
import { resolveChannel } from "@/lib/youtube";

/**
 * Resolves user input to a channel WITHOUT adding it — used by the UI to
 * show a "did you mean this channel?" confirmation for plain-name input.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const input = req.nextUrl.searchParams.get("input")?.trim() ?? "";
  if (!input) {
    return NextResponse.json({ error: "Paste a channel URL or @handle first." }, { status: 400 });
  }
  try {
    const channel = await resolveChannel(input);
    return NextResponse.json({ channel });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 404 }
    );
  }
}
