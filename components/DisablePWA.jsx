"use client";

import { useEffect } from 'react';

export default function DisablePWA() {
  useEffect(() => {
    // Prevenir instalación automática de PWA, pero permitir "Agregar a la pantalla de inicio"
    const preventInstall = (e) => {
      e.preventDefault();
      // No detenemos la propagación completamente para permitir "Agregar a la pantalla de inicio"
    };

    window.addEventListener('beforeinstallprompt', preventInstall);
    
    // Desregistrar cualquier service worker existente para evitar instalación completa
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
        });
      });
    }

    // Limpiar al desmontar
    return () => {
      window.removeEventListener('beforeinstallprompt', preventInstall);
    };
  }, []);

  return null;
}

