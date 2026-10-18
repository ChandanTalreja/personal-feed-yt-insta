"use client";

/* eslint-disable @next/next/no-img-element */
// Images from YouTube use a plain <img>, in this one file:
// - YouTube already serves thumbnails at a sensible size; next/image would
//   need every YouTube image host allowed in config and route each image
//   through the server's optimiser for no gain.
// - referrerPolicy="no-referrer" is required: yt3.ggpht.com (channel
//   avatars) refuses image requests that carry our site as the referrer.

import { useState } from "react";

/**
 * The same YouTube thumbnail as WebP: the same full-size picture at about
 * half the bytes (measured 136 KB → 56 KB; no visible difference at card
 * size). Null for any address it doesn't recognise.
 */
function webpOf(src: string): string | null {
  const m = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\/([a-z0-9_]+)\.jpg$/.exec(src);
  return m ? `https://i.ytimg.com/vi_webp/${m[1]}/${m[2]}.webp` : null;
}

/** A video thumbnail (16:9). Without one, a plain block of `fallback` colour. */
export function Thumb({
  src,
  className = "",
  fallback = "bg-line",
  lazy = false,
  priority = false,
}: {
  src: string | null;
  /** Width, corners, alignment. */
  className?: string;
  fallback?: string;
  /** Load only when scrolled near (long lists and grids). */
  lazy?: boolean;
  /** On screen at once (the feed's first row): load now, ahead of others. */
  priority?: boolean;
}) {
  // WebP first; if YouTube has none for a video, fall back to the JPEG.
  // A missing one doesn't always fail as an error: YouTube can answer with
  // its 120px grey "no thumbnail" placeholder, which loads fine. Every size
  // we store is wider than that, so a 120px-or-smaller WebP means "missing".
  const [jpegFor, setJpegFor] = useState<string | null>(null);
  const webp = src ? webpOf(src) : null;
  const shown = webp && jpegFor !== src ? webp : src;
  const switchToJpeg = () => {
    if (src && shown !== src) setJpegFor(src);
  };
  return src ? (
    <img
      src={shown ?? src}
      alt=""
      loading={priority ? "eager" : lazy ? "lazy" : undefined}
      fetchPriority={priority ? "high" : undefined}
      referrerPolicy="no-referrer"
      onError={switchToJpeg}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth <= 120) switchToJpeg();
      }}
      className={`aspect-video object-cover ${className}`}
    />
  ) : (
    <span className={`block aspect-video ${fallback} ${className}`} />
  );
}

/** A channel's round avatar; its first two letters when it has no picture. */
export function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  const box = { width: size, height: size };
  return src ? (
    <img src={src} alt="" referrerPolicy="no-referrer" style={box} className="shrink-0 rounded-full bg-line" />
  ) : (
    <span style={box} className="flex shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold tracking-tighter">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
