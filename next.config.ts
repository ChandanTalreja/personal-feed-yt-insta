import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reuse a page you visited in the last 5 minutes instead of asking the
    // server for it again on every tab switch (~0.8 s each on the live site).
    // The Feed and Podcasts pages carry their first screen (audit B1), so a
    // reused page carries old data: the screen only trusts it when it was
    // made in the last minute and not shown before (components/feed/
    // firstScreen.ts); otherwise it shows its remembered data and fetches,
    // as before (lib/api-client.ts).
    staleTimes: { dynamic: 300 },
  },
  async redirects() {
    return [
      // The Manage page became Channels (redesign phase 4); old links and
      // bookmarks still land in the right place.
      { source: "/manage", destination: "/channels", permanent: true },
    ];
  },
};

export default nextConfig;
