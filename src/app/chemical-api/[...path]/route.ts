/**
 * Runtime reverse-proxy to the Python FastAPI backend.
 *
 * The browser only ever talks to this Next.js origin (same-origin, no CORS);
 * this handler forwards to the FastAPI service at CHEMICAL_API_URL. Reading the
 * env var at request time (instead of a next.config rewrite, which bakes it in
 * at build) means you can change the backend URL on Vercel without a rebuild.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendBase(): string {
  return process.env.CHEMICAL_API_URL ?? "http://127.0.0.1:8000";
}

async function proxy(request: Request, path: string[]): Promise<Response> {
  const base = backendBase().replace(/\/$/, "");
  const search = new URL(request.url).search;
  const target = `${base}/${path.join("/")}${search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const method = request.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body, redirect: "manual" });
  } catch {
    return Response.json(
      { detail: "검색 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  // Pass through status, body, and the headers that matter for JSON responses
  // and file downloads (export: content-disposition).
  const respHeaders = new Headers();
  for (const key of ["content-type", "content-disposition", "cache-control"]) {
    const value = upstream.headers.get(key);
    if (value) respHeaders.set(key, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return proxy(request, (await ctx.params).path);
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return proxy(request, (await ctx.params).path);
}

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  return proxy(request, (await ctx.params).path);
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return proxy(request, (await ctx.params).path);
}
