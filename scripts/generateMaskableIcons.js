/**
 * Script para generar iconos maskable para PWA
 * Requiere: npm install sharp
 * 
 * Ejecutar: node scripts/generateMaskableIcons.js
 */

const fs = require('fs');
const path = require('path');

// Colores
const BACKGROUND_COLOR = '#1c3d82'; // Azul
const LOGO_COLOR = '#FFFFFF'; // Blanco

// Tamaños
const SIZES = [192, 512];

// Safe zone para iconos maskable (80% del área total)
const SAFE_ZONE_RATIO = 0.8;

console.log('⚠️  Este script requiere la librería "sharp" para generar imágenes.');
console.log('📦 Instala con: npm install sharp --save-dev');
console.log('');
console.log('📋 Especificaciones para los iconos maskable:');
console.log(`   - Fondo: ${BACKGROUND_COLOR}`);
console.log(`   - Logo: ${LOGO_COLOR}`);
console.log(`   - Safe zone: ${(SAFE_ZONE_RATIO * 100).toFixed(0)}% del área total`);
console.log('');
console.log('🎨 Puedes usar herramientas online como:');
console.log('   - https://maskable.app/editor');
console.log('   - https://www.pwabuilder.com/imageGenerator');
console.log('');
console.log('📝 O crear manualmente con:');
console.log('   1. Fondo sólido #1c3d82');
console.log('   2. Logo blanco centrado');
console.log('   3. El logo debe estar dentro del 80% central (safe zone)');
console.log('   4. Guardar como PNG sin transparencia');
console.log('');

// Verificar si sharp está instalado
try {
  const sharp = require('sharp');
  
  // Leer el logo actual si existe
  const logoPath = path.join(__dirname, '../public/icons/icon-512.png');
  const outputDir = path.join(__dirname, '../public/icons');
  
  if (!fs.existsSync(logoPath)) {
    console.log('❌ No se encontró el logo base en:', logoPath);
    console.log('💡 Crea los iconos manualmente o usa una herramienta online.');
    process.exit(1);
  }
  
  console.log('✅ Generando iconos maskable...');
  
  // Leer el logo base
  const logo = sharp(logoPath);
  const metadata = await logo.metadata();
  
  SIZES.forEach(async (size) => {
    const safeZone = Math.floor(size * SAFE_ZONE_RATIO);
    const padding = (size - safeZone) / 2;
    
    // Crear imagen con fondo azul
    const icon = sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        background: BACKGROUND_COLOR
      }
    });
    
    // Redimensionar y centrar el logo en el safe zone
    const resizedLogo = await logo
      .resize(safeZone, safeZone, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();
    
    // Componer: fondo + logo centrado
    const finalIcon = await icon
      .composite([{
        input: resizedLogo,
        top: padding,
        left: padding
      }])
      .png()
      .toBuffer();
    
    // Guardar
    const outputPath = path.join(outputDir, `icon-${size}-maskable.png`);
    fs.writeFileSync(outputPath, finalIcon);
    console.log(`✅ Generado: icon-${size}-maskable.png`);
  });
  
  console.log('');
  console.log('✅ Iconos maskable generados exitosamente!');
  
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('❌ La librería "sharp" no está instalada.');
    console.log('📦 Instala con: npm install sharp --save-dev');
    console.log('');
    console.log('💡 Alternativa: Usa una herramienta online como:');
    console.log('   - https://maskable.app/editor');
    console.log('   - https://www.pwabuilder.com/imageGenerator');
  } else {
    console.error('❌ Error:', error.message);
  }
  process.exit(1);
}

