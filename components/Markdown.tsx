"use client";

import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Renders Gemini's markdown (bold, headings, lists) as real formatting.
 * Safe by construction: react-markdown never renders raw HTML (no
 * rehype-raw) and builds React elements, so the app still has no
 * dangerouslySetInnerHTML anywhere. COPY buttons keep copying the raw text.
 */
const components: Components = {
  h1: ({ children }) => <p className="mt-2 mb-1 font-bold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-2 mb-1 font-bold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-2 mb-1 font-bold first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="mt-2 mb-1 font-bold first:mt-0">{children}</p>,
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  ul: ({ children }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-black/10 px-1 font-mono text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-1.5 overflow-x-auto rounded bg-black/10 p-2">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-1.5 border-l-4 border-[var(--ink)] pl-2 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-[var(--ink)]/30" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </a>
  ),
};

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
