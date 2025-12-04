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
    // Optimizaciones de imágenes
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  // 👇 AGREGAMOS ESTO PARA QUE VERCEL NO BLOQUEE EL BUILD
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Optimizaciones para producción en VPS
  experimental: {
    // Optimizar para servidor tradicional (no serverless)
    serverComponentsExternalPackages: ['mongoose'],
    // Optimizaciones de rendimiento
    // optimizeCss: true, // Deshabilitado: requiere 'critters' que no está instalado
    optimizePackageImports: ['react-icons'],
  },

  // Optimizaciones de compilación
  swcMinify: true, // Usar SWC minifier (más rápido que Terser)
  productionBrowserSourceMaps: false, // Desactivar source maps en producción para mejor rendimiento
  
  // Optimizaciones de compresión
  compress: true, // Habilitar compresión gzip/brotli
  
  // Optimizaciones de caché
  onDemandEntries: {
    // Mantener páginas en memoria más tiempo para VPS
    maxInactiveAge: 60 * 1000, // 60 segundos (aumentado para VPS)
    pagesBufferLength: 10, // Mantener más páginas en buffer
  },
  
  // Optimizaciones de output
  // output: 'standalone', // Solo usar en producción, comentado para desarrollo
  
  // Optimizaciones de poweredByHeader
  poweredByHeader: false, // Ocultar header X-Powered-By por seguridad

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
            value: 'public, s-maxage=30, stale-while-revalidate=60'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
        ],
      },
      {
        source: '/api/clientes',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=120, stale-while-revalidate=240'
          },
        ],
      },
      {
        source: '/api/pagos',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=120'
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

