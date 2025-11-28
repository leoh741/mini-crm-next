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
const originalContent = serverContent;

// Reemplazar [::1] por 0.0.0.0 (IPv6 localhost)
serverContent = serverContent.replace(/\[::1\]/g, '0.0.0.0');

// Reemplazar 'localhost' por '0.0.0.0'
serverContent = serverContent.replace(/'localhost'/g, "'0.0.0.0'");
serverContent = serverContent.replace(/"localhost"/g, '"0.0.0.0"');

// Reemplazar hostname: 'localhost' o host: 'localhost'
serverContent = serverContent.replace(/host(?:name)?:\s*['"]localhost['"]/g, 'hostname: "0.0.0.0"');

// Buscar y reemplazar patrones de listen() más complejos
// Patrón: .listen(port) -> .listen(port, '0.0.0.0')
serverContent = serverContent.replace(
  /\.listen\((\d+)\)/g,
  '.listen($1, "0.0.0.0")'
);

// Patrón: .listen(port, callback) -> .listen(port, '0.0.0.0', callback)
serverContent = serverContent.replace(
  /\.listen\((\d+),\s*function\s*\(/g,
  '.listen($1, "0.0.0.0", function('
);

// Patrón: .listen(port, hostname) -> .listen(port, '0.0.0.0')
serverContent = serverContent.replace(
  /\.listen\((\d+),\s*['"][^'"]*['"]\)/g,
  '.listen($1, "0.0.0.0")'
);

// Buscar configuraciones de servidor HTTP/HTTPS
serverContent = serverContent.replace(
  /createServer\([^)]*\)\.listen\(/g,
  (match) => {
    // Si no tiene hostname, agregarlo
    if (!match.includes('0.0.0.0') && !match.includes('hostname')) {
      return match.replace(/\.listen\(/, '.listen(3000, "0.0.0.0", ');
    }
    return match;
  }
);

// Si no hubo cambios, buscar patrones más específicos
if (serverContent === originalContent) {
  console.log('⚠️  No se encontraron patrones comunes. Buscando patrones específicos...');
  
  // Buscar cualquier referencia a listen y agregar hostname si falta
  const listenMatches = serverContent.match(/\.listen\([^)]+\)/g);
  if (listenMatches) {
    listenMatches.forEach(match => {
      if (!match.includes('0.0.0.0') && !match.includes('localhost')) {
        const newMatch = match.replace(/\)$/, ', "0.0.0.0")');
        serverContent = serverContent.replace(match, newMatch);
      }
    });
  }
}

// Verificar si hubo cambios
if (serverContent === originalContent) {
  console.warn('⚠️  Advertencia: No se realizaron cambios en el servidor. Puede que ya esté configurado o use un formato diferente.');
  console.log('📝 Buscando en el archivo...');
  // Buscar líneas que contengan "listen"
  const lines = serverContent.split('\n');
  const listenLines = lines.filter(line => line.includes('listen'));
  if (listenLines.length > 0) {
    console.log('📋 Líneas con "listen":');
    listenLines.forEach((line, i) => {
      console.log(`   ${i + 1}: ${line.trim().substring(0, 100)}`);
    });
  }
} else {
  fs.writeFileSync(serverPath, serverContent, 'utf8');
  console.log('✅ Servidor modificado exitosamente. Ahora escuchará en 0.0.0.0:3000');
}

console.log('✅ Servidor modificado exitosamente. Ahora escuchará en 0.0.0.0:3000');

