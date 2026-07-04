"use client";

import { useEffect } from "react";
import type { FeedVideo } from "./types";

interface Props {
  video: FeedVideo;
  onClose: () => void;
}

export default function PlayerModal({ video, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="nb w-full max-w-4xl rounded-xl bg-[var(--paper)] p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="font-display text-sm sm:text-base">{video.title}</h2>
          <button
            className="nb-btn shrink-0 rounded px-3 py-1 text-sm"
            onClick={onClose}
          >
            ✕ CLOSE
          </button>
        </div>
        <div
          className={`relative w-full overflow-hidden rounded-lg border-3 border-[var(--ink)] ${
            video.isShort ? "mx-auto aspect-[9/16] max-w-sm" : "aspect-video"
          }`}
        >
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.ytVideoId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
