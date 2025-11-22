/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'digitalspace.com.ar',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig

