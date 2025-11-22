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

  useEffect(() => {
    const usuarioActual = getUsuarioActual();
    setUsuario(usuarioActual);
    setEsAdminUser(esAdmin());
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
    <header className="fixed top-0 left-0 right-0 z-50 p-4 bg-blue-950 border-b border-blue-900 flex justify-between items-center">
      <div className="flex items-center">
        <Link href="/">
          <Image 
            src="https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp"
            alt="Digital Space Logo"
            width={150}
            height={50}
            className="h-8 w-auto cursor-pointer"
          />
        </Link>
      </div>
      <nav className="flex gap-4 text-sm items-center">
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
            <span className="text-xs text-slate-300">{usuario.nombre}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium"
            >
              Cerrar Sesión
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}

