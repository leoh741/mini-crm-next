import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';

export const metadata = {
  title: "Digital Space CRM",
  description: "CRM para gestionar clientes de Digital Space",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-slate-900 text-slate-100">
        <Header />
        <main className="pt-20 md:pt-24 pb-20 md:pb-16 px-3 md:p-4 max-w-4xl mx-auto min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

