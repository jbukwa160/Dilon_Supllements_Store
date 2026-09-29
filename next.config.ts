import type { NextConfig } from "next";

// The public address decides whether browsers are told to use HTTPS only (read at build time, like the sitemap).
const HTTPS = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

// Sent with every response. The proxy (src/proxy.ts) is not a security boundary, these headers are.
const SECURITY_HEADERS = [
  // Never framed (clickjacking): the old header for old browsers, frame-ancestors for new ones.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HTTPS only for a year once the site is served over HTTPS (browsers ignore the header on plain HTTP). Add
  // "; includeSubDomains" at the reverse proxy only when every subdomain of the domain has HTTPS.
  ...(HTTPS ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // exceljs reads/writes the price spreadsheets in the admin panel, nodemailer sends the e-mails;
  // both are Node-only libraries, keep them out of the bundle.
  serverExternalPackages: ["exceljs", "nodemailer"],
  experimental: {
    // "Known routes" prediction (on by default in 16.3) learns "/" → [lang] from the home page, because the proxy's
    // rewrite of "/" to "/bg" isn't detected, and then treats every one-segment URL (/marki, /tseli…) as the home
    // page: its segment prefetches 404 and the prefetch is wasted. Without it the client asks for each route's tree.
    optimisticRouting: false,
    serverActions: {
      // Every public form (checkout, contact, sign-in…) is a Server Action: nothing legitimate comes near 1 MB, so
      // bigger bodies are refused before they are parsed. Admin file uploads (pictures, price files) do not use
      // Server Actions but route handlers under /admin with their own limits (app/admin/upload, …/tseni/import).
      bodySizeLimit: "1mb",
    },
    // The proxy (src/proxy.ts) buffers request bodies of the storefront pages it handles; keep that bounded too
    // (a bit above the action limit, so an oversized action is refused cleanly by the limit above).
    proxyClientMaxBodySize: "2mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The admin panel must never show up in search results (its pages also say noindex).
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
