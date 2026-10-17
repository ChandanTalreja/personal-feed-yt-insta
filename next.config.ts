import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reuse a page you visited in the last 5 minutes instead of asking the
    // server for it again on every tab switch (~0.8 s each on the live site).
    // Safe here: pages carry no data — they check the login and hand over to
    // the screen, which shows its remembered data (lib/api-client.ts).
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
