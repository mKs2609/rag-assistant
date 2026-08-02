import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '15mb',
  },
}

export default nextConfig