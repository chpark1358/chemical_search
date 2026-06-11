import { defineConfig, devices } from "@playwright/test";

// Next.js 16은 localhost 바인딩에서 127.0.0.1 출처의 dev 리소스 요청을 차단하므로
// (allowedDevOrigins 미설정 시 하이드레이션이 깨짐) localhost를 기본값으로 사용한다.
// 포트 3100 + 전용 .next-playwright 디렉터리를 사용해, 개발 중인 dev 서버(3000, .next)와
// 테스트용 dev 서버가 캐시를 공유하다 서로 깨뜨리는 일을 방지한다.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: ".next-playwright"
    }
  }
});
