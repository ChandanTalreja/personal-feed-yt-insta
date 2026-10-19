import type { Answer, FeedVideo } from "@/components/types";

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
