/** @type {import('next').NextConfig} */

// Baseline security headers for every route (pages + API). A Content-Security-Policy
// is deliberately NOT set yet: Next.js App Router inline runtime scripts and the
// Supabase browser client would need a carefully tuned policy (nonce or hash based),
// and a wrong value silently breaks auth. Tracked as future hardening in
// docs/deployment.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  output: "standalone", // slim Docker runtime image
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
