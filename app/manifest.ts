import type { MetadataRoute } from "next";

// Makes TUBEBOX installable as an app (FEAT-19): Chrome's install icon in
// the address bar, "Add to Home Screen" on a phone. It opens in its own
// window, on the Feed, with no tabs or address bar. Deliberately no service
// worker: the app always loads the live site, like a browser tab, so a
// deploy can never leave an old cached version on screen.
// The icons are the mascot (app/icon.svg) on the cream page colour, made
// once as PNGs; app/apple-icon.png is the iPhone home-screen one.
const CREAM = "#fbf6ec"; // --color-cream

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TUBEBOX",
    short_name: "TUBEBOX",
    description: "Your YouTube feed, no algorithm.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: CREAM,
    theme_color: CREAM,
    icons: [
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed, the mascot inside the safe circle: Android crops to a shape.
      { src: "/app-icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
