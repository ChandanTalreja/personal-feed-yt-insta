// Loader + minimal types for YouTube's official IFrame Player API — just the
// parts the player modal uses (no @types package needed). Client-only.

export interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

interface YTPlayerOptions {
  host?: string;
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

/**
 * Loads https://www.youtube.com/iframe_api once and resolves with `window.YT`.
 * Rejects after `timeoutMs` (blocked script, offline…) so callers can fall
 * back to a plain embed — playback must never depend on the tracking.
 */
export function loadYouTubeApi(timeoutMs = 8000): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error("The YouTube player took too long to load. Please try again."));
    }, timeoutMs);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      clearTimeout(timer);
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error("The YouTube player couldn't load. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}
