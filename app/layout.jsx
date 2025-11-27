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
      </head>
      <body className="bg-slate-900 text-slate-100">
        <ServiceWorkerRegistration />
        <Header />
        <main className="pt-20 md:pt-24 pb-20 md:pb-16 px-3 md:p-4 max-w-4xl mx-auto min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

