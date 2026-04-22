import nextConfig from 'eslint-config-next/core-web-vitals'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    rules: {
      // Suppress next/next/no-img-element on the Auth0 user avatar (3rd-party domain)
      '@next/next/no-img-element': 'warn',
    },
  },
]

export default config
