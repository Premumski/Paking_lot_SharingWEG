import { NextResponse, type NextRequest } from "next/server";

/**
 * S-01: per-request nonce Content-Security-Policy.
 * CSRF (S-02): server actions are protected by Next.js' Origin check; for the few JSON API
 * routes that change state the Origin header must match the host as well.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const secure = (process.env.APP_URL ?? "").startsWith("https://");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https://checkout.stripe.com https://connect.stripe.com",
    ...(secure ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/") && !path.startsWith("/api/webhooks/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)" }],
};
