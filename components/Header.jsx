"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getUsuarioActual, logout, esAdmin } from "../lib/authUtils";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState(null);
  const [esAdminUser, setEsAdminUser] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const usuarioActual = getUsuarioActual();
    setUsuario(usuarioActual);
    setEsAdminUser(esAdmin());
  }, [pathname]);

  useEffect(() => {
    // Cerrar menú cuando cambia la ruta
    setMenuAbierto(false);
  }, [pathname]);

  const handleLogout = () => {
    logout();
    router.push("/login");
    router.refresh();
  };

  // No mostrar header en la página de login
  if (pathname === "/login") {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-blue-950 border-b border-blue-900">
      <div className="flex justify-between items-center p-3 md:p-4">
        <div className="flex items-center">
          <Link href="/" onClick={() => setMenuAbierto(false)}>
            <Image 
              src="https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp"
              alt="Digital Space Logo"
              width={150}
              height={50}
              className="h-6 md:h-8 w-auto cursor-pointer"
            />
          </Link>
        </div>
        
        {/* Menú desktop */}
        <nav className="hidden md:flex gap-4 text-sm items-center">
          <Link href="/" className={pathname === "/" ? "text-blue-300" : ""}>
            Inicio
          </Link>
          <Link href="/clientes" className={pathname?.startsWith("/clientes") ? "text-blue-300" : ""}>
            Clientes
          </Link>
          <Link href="/pagos" className={pathname === "/pagos" ? "text-blue-300" : ""}>
            Pagos
          </Link>
          <Link href="/balance" className={pathname === "/balance" ? "text-blue-300" : ""}>
            Balance
          </Link>
          {esAdminUser && (
            <Link href="/admin/usuarios" className={pathname?.startsWith("/admin") ? "text-blue-300" : ""}>
              Usuarios
            </Link>
          )}
          {usuario && (
            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-blue-800">
              <span className="text-xs text-slate-300 hidden lg:inline">{usuario.nombre}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium"
              >
                Salir
              </button>
            </div>
          )}
        </nav>

        {/* Botón hamburguesa móvil */}
        <button
          onClick={() => setMenuAbierto(!menuAbierto)}
          className="md:hidden p-2 text-slate-300 hover:text-white"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuAbierto ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Menú móvil desplegable */}
      {menuAbierto && (
        <nav className="md:hidden border-t border-blue-900 bg-blue-950">
          <div className="flex flex-col">
            <Link 
              href="/" 
              className={`px-4 py-3 ${pathname === "/" ? "text-blue-300 bg-blue-900/50" : "text-slate-300"} hover:bg-blue-900/30`}
              onClick={() => setMenuAbierto(false)}
            >
              Inicio
            </Link>
            <Link 
              href="/clientes" 
              className={`px-4 py-3 ${pathname?.startsWith("/clientes") ? "text-blue-300 bg-blue-900/50" : "text-slate-300"} hover:bg-blue-900/30`}
              onClick={() => setMenuAbierto(false)}
            >
              Clientes
            </Link>
            <Link 
              href="/pagos" 
              className={`px-4 py-3 ${pathname === "/pagos" ? "text-blue-300 bg-blue-900/50" : "text-slate-300"} hover:bg-blue-900/30`}
              onClick={() => setMenuAbierto(false)}
            >
              Pagos
            </Link>
            <Link 
              href="/balance" 
              className={`px-4 py-3 ${pathname === "/balance" ? "text-blue-300 bg-blue-900/50" : "text-slate-300"} hover:bg-blue-900/30`}
              onClick={() => setMenuAbierto(false)}
            >
              Balance
            </Link>
            {esAdminUser && (
              <Link 
                href="/admin/usuarios" 
                className={`px-4 py-3 ${pathname?.startsWith("/admin") ? "text-blue-300 bg-blue-900/50" : "text-slate-300"} hover:bg-blue-900/30`}
                onClick={() => setMenuAbierto(false)}
              >
                Usuarios
              </Link>
            )}
            {usuario && (
              <div className="px-4 py-3 border-t border-blue-900">
                <div className="text-xs text-slate-400 mb-2">{usuario.nombre}</div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium"
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

