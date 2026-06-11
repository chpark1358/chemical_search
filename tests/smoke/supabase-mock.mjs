/**
 * 스모크 테스트용 로컬 Supabase 목 서버.
 *
 * 앱(미들웨어/서버 컴포넌트)은 NEXT_PUBLIC_SUPABASE_URL로 향하는데, 미들웨어의
 * getUser()는 서버 측 fetch라 Playwright page.route로 가로챌 수 없다. 그래서
 * Playwright dev 서버의 NEXT_PUBLIC_SUPABASE_URL을 이 로컬 목 서버로 돌려,
 * 인증(/auth/v1/*)과 PostgREST(/rest/v1/*) 호출을 모두 여기서 처리한다.
 *
 * 동작:
 * - GET  /auth/v1/user           → 요청에 Bearer 토큰이 있으면 가짜 사용자 200, 없으면 401.
 * - POST /auth/v1/token?...      → signInWithPassword/refresh용 세션 200(테스트에서 직접
 *                                  쿠키를 심으므로 보통 호출되지 않지만, 안전하게 응답).
 * - GET  /rest/v1/saved_items    → []
 * - GET  /rest/v1/search_history → []
 * - 그 외 /rest/v1/* 변이(POST/PATCH/DELETE) → []/204 (저장은 검증하지 않고 통과시킨다).
 *
 * 앱 자체에는 어떤 테스트용 우회 코드도 넣지 않는다(게이트는 그대로 동작).
 */

import { createServer } from "node:http";

const PORT = Number(process.env.SUPABASE_MOCK_PORT ?? 54321);

const FAKE_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "smoke@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "",
  confirmed_at: "2026-01-01T00:00:00Z",
  last_sign_in_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_anonymous: false
};

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

const FAKE_SESSION = {
  access_token: "fake-access-token",
  refresh_token: "fake-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: FAR_FUTURE,
  user: FAKE_USER
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*"
  });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const { pathname } = url;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*"
    });
    res.end();
    return;
  }

  // 인증: 현재 사용자
  if (pathname === "/auth/v1/user") {
    const auth = req.headers["authorization"];
    if (auth && /bearer\s+.+/i.test(auth)) {
      sendJson(res, 200, FAKE_USER);
    } else {
      sendJson(res, 401, { message: "missing token" });
    }
    return;
  }

  // 인증: 토큰 발급/갱신(테스트에선 보통 안 쓰지만 안전하게 세션 반환)
  if (pathname === "/auth/v1/token") {
    sendJson(res, 200, FAKE_SESSION);
    return;
  }

  // 인증: 로그아웃
  if (pathname === "/auth/v1/logout") {
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
    return;
  }

  // PostgREST: 사용자별 데이터. 빈 목록으로 응답(저장/기록은 검증 대상 아님).
  if (pathname.startsWith("/rest/v1/")) {
    if (method === "GET") {
      sendJson(res, 200, []);
    } else if (method === "DELETE") {
      sendJson(res, 200, []);
    } else {
      // POST(insert/upsert)/PATCH(update): 빈 배열로 통과.
      sendJson(res, 201, []);
    }
    return;
  }

  // 헬스 체크 등
  sendJson(res, 200, { ok: true });
});

server.listen(PORT, () => {
  // Playwright webServer는 url 200을 기다린다.
  process.stdout.write(`supabase-mock listening on ${PORT}\n`);
});
