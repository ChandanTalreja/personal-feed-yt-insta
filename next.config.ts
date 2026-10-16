import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The Manage page became Channels (redesign phase 4); old links and
      // bookmarks still land in the right place.
      { source: "/manage", destination: "/channels", permanent: true },
    ];
  },
};

export default nextConfig;
