import type { NextConfig } from "next";

// Fully static export: every page is pre-rendered HTML in `out/`, hostable on any
// static host (Vercel Hobby today, Cloudflare Pages later) with no server.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
