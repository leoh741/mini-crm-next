"use client";

import { usePathname } from "next/navigation";
import { memo } from "react";

function Footer() {
  const pathname = usePathname();

  // No mostrar footer en la página de login ni en páginas compartidas
  if (pathname === "/login" || pathname?.startsWith('/informes/compartido')) {
    return null;
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 p-2 md:p-3 bg-slate-800 border-t border-slate-700">
      <div className="max-w-4xl mx-auto text-center px-3">
        <p className="text-xs text-slate-400">
          Digital Space CRM Copyright © 2025 - Todos los derechos reservados
        </p>
      </div>
    </footer>
  );
}

// Memoizar Footer para evitar re-renders innecesarios
export default memo(Footer);

