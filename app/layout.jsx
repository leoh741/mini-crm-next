import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import DisablePWA from '../components/DisablePWA';

export const metadata = {
  title: "Digital Space CRM",
  description: "CRM para gestionar clientes de Digital Space",
  icons: {
    icon: '/logo-512x512.png',
    apple: '/logo-512x512.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/logo-512x512.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo-512x512.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="application-name" content="Digital Space CRM" />
        <meta name="msapplication-TileColor" content="#0f172a" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Prevenir instalación automática de PWA, pero permitir "Agregar a la pantalla de inicio"
              (function() {
                // Prevenir el prompt automático de instalación
                window.addEventListener('beforeinstallprompt', function(e) {
                  e.preventDefault();
                  // No detenemos la propagación completamente para permitir "Agregar a la pantalla de inicio"
                }, {capture: true, passive: false});
                
                // Desregistrar service workers para evitar instalación completa
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
        <main className="pt-20 md:pt-24 pb-20 md:pb-16 px-3 md:p-4 max-w-4xl mx-auto min-h-screen" style={{ overflow: 'visible' }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

