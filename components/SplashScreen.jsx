"use client";

import { useEffect, useState } from 'react';

export default function SplashScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [splashImage, setSplashImage] = useState(null);

  useEffect(() => {
    // Determinar qué imagen de splash usar basado en el tamaño de pantalla
    const getSplashImage = () => {
      const width = window.screen.width || window.innerWidth;
      const height = window.screen.height || window.innerHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      
      // Usar las dimensiones físicas de la pantalla
      const deviceWidth = Math.round(width * pixelRatio);
      const deviceHeight = Math.round(height * pixelRatio);

      // Mapeo de resoluciones a imágenes de splash (con tolerancia)
      const resolutions = [
        { w: 1284, h: 2778, img: '/splash/splash-1284x2778.png' },
        { w: 1170, h: 2532, img: '/splash/splash-1170x2532.png' },
        { w: 1125, h: 2436, img: '/splash/splash-1125x2436.png' },
        { w: 828, h: 1792, img: '/splash/splash-828x1792.png' },
        { w: 750, h: 1334, img: '/splash/splash-750x1334.png' },
        { w: 640, h: 1136, img: '/splash/splash-640x1136.png' },
        { w: 720, h: 1280, img: '/splash/splash-720x1280.png' },
        { w: 1080, h: 1920, img: '/splash/splash-1080x1920.png' },
        { w: 1440, h: 2960, img: '/splash/splash-1440x2960.png' },
        { w: 1536, h: 2048, img: '/splash/splash-1536x2048.png' },
      ];

      // Buscar coincidencia exacta o más cercana
      for (const res of resolutions) {
        if (Math.abs(deviceWidth - res.w) < 10 && Math.abs(deviceHeight - res.h) < 10) {
          return res.img;
        }
      }
      
      // Fallback: usar la imagen más cercana por proporción y tamaño
      const aspectRatio = deviceHeight / deviceWidth;
      const totalPixels = deviceWidth * deviceHeight;
      
      if (aspectRatio > 2.0) {
        // Pantallas muy altas
        if (totalPixels > 3000000) return '/splash/splash-1284x2778.png';
        return '/splash/splash-1170x2532.png';
      }
      if (aspectRatio > 1.7) {
        // Pantallas estándar modernas
        if (totalPixels > 2000000) return '/splash/splash-1080x1920.png';
        return '/splash/splash-720x1280.png';
      }
      // Pantallas más cuadradas
      return '/splash/splash-1536x2048.png';
    };

    setSplashImage(getSplashImage());

    // Ocultar el splash después de que la página cargue completamente
    const handleLoad = () => {
      setTimeout(() => {
        setIsLoading(false);
      }, 800); // Delay un poco más largo para asegurar que se vea
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
      className="fixed inset-0 z-[9999]"
      style={{
        backgroundColor: '#0c1628',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {splashImage ? (
        <img 
          src={splashImage}
          alt="Digital Space CRM"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
          onError={(e) => {
            // Si la imagen falla, mostrar fondo con ícono
            e.target.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;';
            fallback.innerHTML = '<img src="/icons/icon-512.png" alt="Digital Space CRM" style="width: 128px; height: 128px;" /><div style="color: white; margin-top: 16px; font-size: 18px; font-weight: 600;">Digital Space CRM</div>';
            e.target.parentElement.appendChild(fallback);
          }}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center">
            <img 
              src="/icons/icon-512.png" 
              alt="Digital Space CRM" 
              className="w-32 h-32 mb-4"
            />
            <div className="text-white text-lg font-semibold">Digital Space CRM</div>
          </div>
        </div>
      )}
    </div>
  );
}

