/**
 * Script para crear iconos sólidos (solo fondo azul) para evitar pre-splash
 * 
 * Ejecutar: node scripts/createSolidIcons.js
 * Requiere: npm install sharp --save-dev
 */

const fs = require('fs');
const path = require('path');

const COLOR = '#1c3d82'; // Azul
const SIZES = [192, 512];
const OUTPUT_DIR = path.join(__dirname, '../public/icons');

console.log('🎨 Generando iconos sólidos para evitar pre-splash...\n');

async function createSolidIcons() {
  try {
    const sharp = require('sharp');
    
    // Crear directorio si no existe
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Generar cada tamaño
    for (const size of SIZES) {
      const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
      
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 3,
          background: COLOR
        }
      })
      .png()
      .toFile(outputPath);
      
      console.log(`✅ Generado: icon-${size}.png (${size}x${size}px, color ${COLOR})`);
    }
    
    console.log('\n✨ Iconos sólidos generados exitosamente!');
    console.log('\n📋 Próximos pasos:');
    console.log('   1. Limpia la caché del navegador');
    console.log('   2. Desinstala la PWA');
    console.log('   3. Reinstala la PWA');
    console.log('   4. El pre-splash ahora será solo azul (sin icono visible)');
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('❌ La librería "sharp" no está instalada.');
      console.log('📦 Instala con: npm install sharp --save-dev\n');
      console.log('💡 Alternativa manual:');
      console.log('   1. Crea imágenes 192x192 y 512x512px');
      console.log(`   2. Rellena con color ${COLOR}`);
      console.log('   3. Guarda como PNG sin transparencia');
      console.log('   4. Reemplaza en /public/icons/');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

// Ejecutar la función
createSolidIcons();

