import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pdfkit", "web-push", "nodemailer"],
  // Files read at runtime that static tracing cannot see.
  outputFileTracingIncludes: {
    "/**": ["./messages/**/*.json", "./node_modules/pdfkit/js/data/**", "./node_modules/.prisma/client/**"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  async headers() {
    const secure = (process.env.APP_URL ?? "").startsWith("https://");
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    if (secure) {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default withNextIntl(nextConfig);
