import type { Answer, CheatSheetItem, FeedVideo } from "@/components/types";

/** One video in the list: the video, its answers (oldest first), and when it was last touched. */
export interface Entry {
  video: FeedVideo;
  answers: Answer[];
  lastActivity: string;
}

/** One video as Markdown: title, link, every Q&A, your note. */
export function videoMarkdown(e: Entry): string {
  const parts = [
    `## ${e.video.title} (${e.video.channelTitle})`,
    `https://youtu.be/${e.video.ytVideoId}`,
    ...e.answers.map((a) => `**Q: ${a.prompt.trim()}**\n\n${a.answer.trim()}`),
  ];
  if (e.video.personalNote) parts.push(`**My note**\n\n${e.video.personalNote.trim()}`);
  return parts.join("\n\n");
}

/** "Hash map cheat sheet": the search as typed, first letter capitalised. */
export function sheetTitle(query: string): string {
  return `${query.charAt(0).toUpperCase()}${query.slice(1)} cheat sheet`;
}

/** "All genres", "No genre", or the genre's name, for a cheat sheet's genre choice. */
export function genreLabel(genreKey: string, genres: { id: number; name: string }[]): string {
  if (genreKey === "all") return "All genres";
  if (genreKey === "none") return "No genre";
  return genres.find((g) => String(g.id) === genreKey)?.name ?? "A removed genre";
}

/** A cheat sheet as Markdown: each question, its short answer, where it was asked. */
export function sheetMarkdown(sheet: CheatSheetItem, videoTitle: (id: number) => string | null, genre: string): string {
  const lines = [`# ${sheetTitle(sheet.query)}`, `${genre} · ${sheet.questions.length} questions`];
  sheet.questions.forEach((q, i) => {
    const asked = q.videoIds.map(videoTitle).filter(Boolean);
    lines.push(
      `${i + 1}. **${q.question}**` +
        (q.answer ? `\n   ${q.answer}` : "") +
        (asked.length ? `\n   _Asked in: ${asked.join("; ")}_` : "")
    );
  });
  return lines.join("\n\n") + "\n";
}
