import { useId } from "react";

/**
 * The Gemini sparkle: a four-pointed star in Gemini's blue-to-pink
 * gradient, drawn inline (no image file). Used where the app hands a job
 * to Gemini, in place of the word.
 */
export default function GeminiMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="0.55" stopColor="#9b72cb" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.6 17.4 12 24 12C17.4 12 12 17.4 12 24C12 17.4 6.6 12 0 12C6.6 12 12 6.6 12 0Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}
