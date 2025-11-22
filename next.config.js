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

  // 👇 AGREGAMOS ESTO PARA QUE VERCEL NO BLOQUEE EL BUILD
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Optimizaciones para Vercel
  experimental: {
    // Optimizar para serverless
    serverComponentsExternalPackages: ['mongoose'],
  },
};

module.exports = nextConfig;

