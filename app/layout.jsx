import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';
import SplashScreen from '../components/SplashScreen';

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
        <meta name="theme-color" content="#0c1628" />
        <meta name="msapplication-TileColor" content="#0c1628" />
        <meta name="msapplication-navbutton-color" content="#0c1628" />
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
        <ServiceWorkerRegistration />
        <SplashScreen />
        <Header />
        <main className="pt-20 md:pt-24 pb-20 md:pb-16 px-3 md:p-4 max-w-4xl mx-auto min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

