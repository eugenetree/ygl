/** @type {import('next').NextConfig} */
const nextConfig = {
  // In production Traefik sends /api to the API on the same origin (ADR-0008).
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/api/:path*", destination: "http://localhost:3001/api/:path*" },
    ];
  },
};

export default nextConfig;
