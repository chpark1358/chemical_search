import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Playwright 등 별도 dev 서버가 사용자 dev 서버의 .next 캐시를 건드리지 않도록
  // 빌드 디렉터리를 환경 변수로 분리할 수 있게 한다 (기본값 .next).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
