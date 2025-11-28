import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import DisablePWA from '../components/DisablePWA';

export const metadata = {
  title: "Digital Space CRM",
  description: "CRM para gestionar clientes de Digital Space",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="no" />
        <meta name="apple-mobile-web-app-capable" content="no" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="application-name" content="" />
        <meta name="msapplication-TileColor" content="" />
        <meta name="msapplication-config" content="" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Prevenir instalación de PWA - ejecutar inmediatamente
              (function() {
                window.addEventListener('beforeinstallprompt', function(e) {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  return false;
                }, {capture: true, passive: false});
                
                // Desregistrar service workers
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    registrations.forEach(function(registration) {
                      registration.unregister();
                    });
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body className="bg-slate-900 text-slate-100" suppressHydrationWarning>
        <DisablePWA />
        <Header />
        <main className="pt-20 md:pt-24 pb-20 md:pb-16 px-3 md:p-4 max-w-4xl mx-auto min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

