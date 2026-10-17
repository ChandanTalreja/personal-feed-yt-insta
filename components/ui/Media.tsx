/* eslint-disable @next/next/no-img-element */
// Images from YouTube use a plain <img>, in this one file:
// - YouTube already serves thumbnails at a sensible size; next/image would
//   need every YouTube image host allowed in config and route each image
//   through the server's optimiser for no gain.
// - referrerPolicy="no-referrer" is required: yt3.ggpht.com (channel
//   avatars) refuses image requests that carry our site as the referrer.

/** A video thumbnail (16:9). Without one, a plain block of `fallback` colour. */
export function Thumb({
  src,
  className = "",
  fallback = "bg-line",
  lazy = false,
}: {
  src: string | null;
  /** Width, corners, alignment. */
  className?: string;
  fallback?: string;
  /** Load only when scrolled near (long lists and grids). */
  lazy?: boolean;
}) {
  return src ? (
    <img
      src={src}
      alt=""
      loading={lazy ? "lazy" : undefined}
      referrerPolicy="no-referrer"
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
