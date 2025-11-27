"use client";

import { useEffect, useState } from 'react';

export default function SplashScreen() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Ocultar el splash después de que la página cargue completamente
    const handleLoad = () => {
      setTimeout(() => {
        setIsLoading(false);
      }, 500); // Pequeño delay para transición suave
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  if (!isLoading) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0c1628]"
      style={{
        backgroundColor: '#0c1628',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
    >
      <div className="flex flex-col items-center justify-center">
        <img 
          src="/icons/icon-512.png" 
          alt="Digital Space CRM" 
          className="w-32 h-32 mb-4 animate-pulse"
        />
        <div className="text-white text-lg font-semibold">Digital Space CRM</div>
      </div>
    </div>
  );
}

