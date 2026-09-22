import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // end-to-end tests build into their own folder so they don't clash with `npm run dev`
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    proxyClientMaxBodySize: '15mb',
  },
}

export default nextConfig