#!/usr/bin/env node
// Script para configurar correctamente los archivos estáticos en modo standalone
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const standaloneDir = path.join(projectRoot, '.next', 'standalone');
const staticDir = path.join(projectRoot, '.next', 'static');
const publicDir = path.join(projectRoot, 'public');

console.log('🔧 Configurando archivos estáticos para modo standalone...');

// Verificar que existe el build
if (!fs.existsSync(standaloneDir)) {
  console.log('ℹ️  Modo standalone no está habilitado (output: "standalone" está comentado en next.config.js)');
  console.log('ℹ️  Si necesitas modo standalone, descomenta la línea en next.config.js');
  console.log('✅ Build completado exitosamente sin modo standalone');
  process.exit(0); // Salir exitosamente en lugar de fallar
}

// Crear directorio .next/static dentro de standalone si no existe
const standaloneStaticDir = path.join(standaloneDir, '.next', 'static');
if (!fs.existsSync(standaloneStaticDir)) {
  fs.mkdirSync(standaloneStaticDir, { recursive: true });
  console.log('✅ Creado directorio .next/static en standalone');
}

// Copiar archivos estáticos si existen
if (fs.existsSync(staticDir)) {
  const copyRecursiveSync = (src, dest) => {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    
    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      fs.readdirSync(src).forEach(childItemName => {
        copyRecursiveSync(
          path.join(src, childItemName),
          path.join(dest, childItemName)
        );
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  };
  
  try {
    copyRecursiveSync(staticDir, standaloneStaticDir);
    console.log('✅ Archivos estáticos copiados a standalone');
  } catch (error) {
    console.warn('⚠️  Error al copiar archivos estáticos:', error.message);
  }
} else {
  console.warn('⚠️  No se encontró el directorio .next/static');
}

// Copiar carpeta public si existe
const standalonePublicDir = path.join(standaloneDir, 'public');
if (fs.existsSync(publicDir)) {
  if (!fs.existsSync(standalonePublicDir)) {
    fs.mkdirSync(standalonePublicDir, { recursive: true });
  }
  
  const copyRecursiveSync = (src, dest) => {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    
    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      fs.readdirSync(src).forEach(childItemName => {
        copyRecursiveSync(
          path.join(src, childItemName),
          path.join(dest, childItemName)
        );
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  };
  
  try {
    copyRecursiveSync(publicDir, standalonePublicDir);
    console.log('✅ Archivos públicos copiados a standalone');
  } catch (error) {
    console.warn('⚠️  Error al copiar archivos públicos:', error.message);
  }
} else {
  console.warn('⚠️  No se encontró el directorio public');
}

console.log('✅ Configuración de standalone completada');

