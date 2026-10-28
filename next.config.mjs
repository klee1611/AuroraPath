/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // Auth0 deliberately uses a runtime-constructed `crypto` import so bundlers
    // leave Node's built-in module external. Suppress only webpack's warning for
    // that intentional pattern; keep unrelated critical dependency warnings.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@auth0[\\/]nextjs-auth0[\\/]dist[\\/]utils[\\/]dpopUtils\.js/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ]
    return config
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's.gravatar.com' },
      { protocol: 'https', hostname: '*.auth0.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Limit referrer info leakage
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable unnecessary browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), payment=(), usb=()',
          },
          // HSTS — enforce HTTPS in production (browsers cache for 1 year)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ]
  },
}

export default nextConfig
