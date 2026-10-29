/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async redirects() {
    // Spotlights was rebranded to Shout-outs; keep old links working.
    return [
      { source: '/dashboard/spotlights', destination: '/dashboard/shout-outs', permanent: true },
    ]
  },
}

module.exports = nextConfig
