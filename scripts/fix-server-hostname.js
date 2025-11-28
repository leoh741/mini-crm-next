#!/usr/bin/env node
// Script para modificar el servidor standalone de Next.js para que escuche en 0.0.0.0
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('❌ No se encontró el servidor standalone. Ejecuta "npm run build" primero.');
  process.exit(1);
}

console.log('🔧 Modificando servidor standalone para escuchar en 0.0.0.0...');

let serverContent = fs.readFileSync(serverPath, 'utf8');

// Reemplazar localhost por 0.0.0.0 en las llamadas a listen
serverContent = serverContent.replace(
  /\.listen\((\d+)(?:,\s*['"]localhost['"])?\)/g,
  '.listen($1, "0.0.0.0")'
);

// Reemplazar [::1] por 0.0.0.0
serverContent = serverContent.replace(/\[::1\]/g, '0.0.0.0');

// Reemplazar localhost en objetos de opciones
serverContent = serverContent.replace(
  /host(?:name)?:\s*['"]localhost['"]/g,
  'hostname: "0.0.0.0"'
);

// Reemplazar hostname: undefined o sin hostname por hostname: "0.0.0.0"
serverContent = serverContent.replace(
  /(listen\([^,]+),\s*undefined/g,
  '$1, "0.0.0.0"'
);

fs.writeFileSync(serverPath, serverContent, 'utf8');

console.log('✅ Servidor modificado exitosamente. Ahora escuchará en 0.0.0.0:3000');

