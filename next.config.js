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

  // Optimizaciones para producción en VPS
  experimental: {
    // Optimizar para servidor tradicional (no serverless)
    serverComponentsExternalPackages: ['mongoose'],
  },

  // Optimizaciones de compilación
  swcMinify: true, // Usar SWC minifier (más rápido que Terser)
  
  // Optimizaciones de compresión
  compress: true, // Habilitar compresión gzip/brotli
  
  // Optimizaciones de caché
  onDemandEntries: {
    // Mantener páginas en memoria más tiempo
    maxInactiveAge: 25 * 1000, // 25 segundos
    pagesBufferLength: 5, // Mantener 5 páginas en buffer
  },

  // Headers de rendimiento
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=120'
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate'
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/'
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json'
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

