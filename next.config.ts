import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  },
  async rewrites() {
    return [
      {
        source: "/chemical-api/:path*",
        destination: `${process.env.CHEMICAL_API_URL ?? "http://127.0.0.1:8000"}/:path*`
      }
    ];
  }
};

export default nextConfig;
