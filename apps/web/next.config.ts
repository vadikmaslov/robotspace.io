/** @type {import('next').NextConfig} */
const nextConfig = {
  // React strict mode
  reactStrictMode: true,

  // Server Components by default (no need to opt-in)
  experimental: {},

  // Image optimization (placeholder — S3 in production)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.wikimedia.org' },
      { protocol: 'https', hostname: '**.wikidata.org' },
    ],
  },

  // HTTP headers (CSP in production, permissive in dev)
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production'
    const contentSecurityPolicy = isProduction
      ? "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:"
      : "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' http: https: ws:"

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/api/robot-image/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" }],
      },
    ]
  },

  // Bundle optimization
  // Keep Prisma outside the server bundle so its native query engine stays
  // next to the generated client in both dev and standalone production builds.
  serverExternalPackages: ['@prisma/client', '@robotspace/db'],
  output: 'standalone',
  poweredByHeader: false,
  trailingSlash: false,
}

export default nextConfig
