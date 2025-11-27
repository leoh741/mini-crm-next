import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';

export const metadata = {
  title: "Digital Space CRM",
  description: "CRM para gestionar clientes de Digital Space",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Digital Space CRM",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Digital Space CRM" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1c3d82" />
        <meta name="msapplication-TileColor" content="#1c3d82" />
        <meta name="msapplication-navbutton-color" content="#1c3d82" />
        <meta name="mobile-web-app-status-bar-style" content="#1c3d82" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Digital Space CRM" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" href="/splash/splash-1080x1920.png" as="image" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1284x2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-640x1136.png" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-720x1280.png" media="(device-width: 360px) and (device-height: 640px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1080x1920.png" media="(device-width: 360px) and (device-height: 640px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1440x2960.png" media="(device-width: 412px) and (device-height: 846px) and (-webkit-device-pixel-ratio: 4)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1536x2048.png" media="(min-device-width: 768px) and (max-device-width: 1024px)" />
      </head>
      <body className="bg-slate-900 text-slate-100">
        {/* Splash screen inline - se muestra inmediatamente antes de que React cargue */}
        <div 
          id="inline-splash"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 99999,
            margin: 0,
            padding: 0,
            overflow: 'hidden',
            display: 'block'
          }}
        >
          <img 
            id="inline-splash-img"
            src="/splash/splash-1080x1920.png"
            alt="Digital Space CRM"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block',
              margin: 0,
              padding: 0
            }}
          />
        </div>
        <ServiceWorkerRegistration />
        <Header />
        <main className="pt-20 md:pt-24 pb-20 md:pb-16 px-3 md:p-4 max-w-4xl mx-auto min-h-screen">{children}</main>
        <Footer />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Detectar resolución y seleccionar splash apropiado
              (function() {
                function getSplashImage() {
                  var width = window.screen.width || window.innerWidth;
                  var height = window.screen.height || window.innerHeight;
                  var pixelRatio = window.devicePixelRatio || 1;
                  var deviceWidth = Math.round(width * pixelRatio);
                  var deviceHeight = Math.round(height * pixelRatio);
                  
                  // Mapeo de resoluciones
                  var resolutions = [
                    { w: 1284, h: 2778, img: '/splash/splash-1284x2778.png' },
                    { w: 1170, h: 2532, img: '/splash/splash-1170x2532.png' },
                    { w: 1125, h: 2436, img: '/splash/splash-1125x2436.png' },
                    { w: 828, h: 1792, img: '/splash/splash-828x1792.png' },
                    { w: 750, h: 1334, img: '/splash/splash-750x1334.png' },
                    { w: 640, h: 1136, img: '/splash/splash-640x1136.png' },
                    { w: 720, h: 1280, img: '/splash/splash-720x1280.png' },
                    { w: 1080, h: 1920, img: '/splash/splash-1080x1920.png' },
                    { w: 1440, h: 2960, img: '/splash/splash-1440x2960.png' },
                    { w: 1536, h: 2048, img: '/splash/splash-1536x2048.png' }
                  ];
                  
                  for (var i = 0; i < resolutions.length; i++) {
                    if (Math.abs(deviceWidth - resolutions[i].w) < 10 && 
                        Math.abs(deviceHeight - resolutions[i].h) < 10) {
                      return resolutions[i].img;
                    }
                  }
                  
                  // Fallback
                  var aspectRatio = deviceHeight / deviceWidth;
                  if (aspectRatio > 2.0) return '/splash/splash-1284x2778.png';
                  if (aspectRatio > 1.7) return '/splash/splash-1080x1920.png';
                  return '/splash/splash-1080x1920.png';
                }
                
                // Actualizar imagen del splash
                var splashImg = document.getElementById('inline-splash-img');
                if (splashImg) {
                  splashImg.src = getSplashImage();
                }
                
                function hideInlineSplash() {
                  var splash = document.getElementById('inline-splash');
                  if (splash) {
                    splash.style.opacity = '0';
                    splash.style.transition = 'opacity 0.3s ease-out';
                    setTimeout(function() {
                      splash.style.display = 'none';
                      document.body.classList.add('splash-hidden');
                    }, 300);
                  }
                }
                
                // Ocultar cuando el DOM esté listo (sin delay para mostrar splash inmediatamente)
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', function() {
                    setTimeout(hideInlineSplash, 1000);
                  });
                } else {
                  setTimeout(hideInlineSplash, 1000);
                }
                
                // También ocultar cuando la página esté completamente cargada
                window.addEventListener('load', function() {
                  setTimeout(hideInlineSplash, 1000);
                });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}

