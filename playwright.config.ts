import { defineConfig, devices } from "@playwright/test";

// Next.js 16은 localhost 바인딩에서 127.0.0.1 출처의 dev 리소스 요청을 차단하므로
// (allowedDevOrigins 미설정 시 하이드레이션이 깨짐) localhost를 기본값으로 사용한다.
// 포트 3100 + 전용 .next-playwright 디렉터리를 사용해, 개발 중인 dev 서버(3000, .next)와
// 테스트용 dev 서버가 캐시를 공유하다 서로 깨뜨리는 일을 방지한다.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

// 인증 게이트를 위해 앱은 NEXT_PUBLIC_SUPABASE_URL로 향한다. 미들웨어의 getUser()는
// 서버 측 fetch라 page.route로 가로챌 수 없으므로, 테스트에서는 이 값을 로컬 목 서버
// (tests/smoke/supabase-mock.mjs)로 돌려 인증/PostgREST 호출을 모두 처리한다.
// 앱 코드에는 테스트 우회가 전혀 없다(게이트는 그대로 동작).
const SUPABASE_MOCK_PORT = 54321;
const SUPABASE_MOCK_URL = `http://localhost:${SUPABASE_MOCK_PORT}`;

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
  webServer: [
    {
      // 로컬 Supabase 목(인증 + PostgREST). Next dev 서버가 이 URL로 향한다.
      command: "node tests/smoke/supabase-mock.mjs",
      url: SUPABASE_MOCK_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        SUPABASE_MOCK_PORT: String(SUPABASE_MOCK_PORT)
      }
    },
    {
      command: "npm run dev -- --port 3100",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: ".next-playwright",
        // 게이트가 통과/검증할 수 있도록 Supabase를 로컬 목으로 돌린다.
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_MOCK_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "smoke-anon-key"
      }
    }
  ]
});
