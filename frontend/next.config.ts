import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The repo root has a lockfile of its own. Without both roots Next takes the
  // repo root and nests the standalone server under frontend/, which breaks
  // the Dockerfile.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // next dev writes an AGENTS.md into the app when it detects a coding agent.
  agentRules: false,
  // In production Traefik sends /api to the API on the same origin (ADR-0008).
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
