import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { resolveChannel } from "@/lib/youtube";

/**
 * Resolves user input to a channel WITHOUT adding it — used by the UI to
 * show a "did you mean this channel?" confirmation for plain-name input.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const input = req.nextUrl.searchParams.get("input")?.trim() ?? "";
  if (!input) {
    return NextResponse.json({ error: "Nothing to look up" }, { status: 400 });
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
