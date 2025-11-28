"use client";

import { useEffect } from 'react';

export default function DisablePWA() {
  useEffect(() => {
    // Prevenir instalación de PWA
    const preventInstall = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    window.addEventListener('beforeinstallprompt', preventInstall);
    
    // Desregistrar cualquier service worker existente
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

