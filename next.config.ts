import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Playwright 등 별도 dev 서버가 사용자 dev 서버의 .next 캐시를 건드리지 않도록
  // 빌드 디렉터리를 환경 변수로 분리할 수 있게 한다 (기본값 .next).
  distDir: process.env.NEXT_DIST_DIR ?? ".next"
  // /chemical-api/* → FastAPI 프록시는 src/app/chemical-api/[...path]/route.ts에서
  // 런타임에 처리한다(빌드 시점에 URL을 박는 rewrite 대신). CHEMICAL_API_URL을
  // 바꿔도 재빌드 없이 반영된다.
};

export default nextConfig;
