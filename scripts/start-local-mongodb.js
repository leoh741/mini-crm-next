// Script para iniciar MongoDB local en Windows
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Iniciando MongoDB Local...\n');

// Buscar MongoDB en ubicaciones comunes
const mongoPaths = [
  'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
  'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe',
  'C:\\Program Files\\MongoDB\\Server\\5.0\\bin\\mongod.exe',
  'C:\\mongodb\\bin\\mongod.exe',
  'mongod' // Si está en PATH
];

let mongodPath = null;
for (const mongoPath of mongoPaths) {
  try {
    if (mongoPath === 'mongod') {
      execSync('mongod --version', { stdio: 'pipe' });
      mongodPath = 'mongod';
      break;
    } else if (fs.existsSync(mongoPath)) {
      mongodPath = mongoPath;
      break;
    }
  } catch (error) {
    continue;
  }
}

if (!mongodPath) {
  console.error('❌ MongoDB no encontrado.');
  console.error('\n📥 Instalación de MongoDB:');
  console.error('   1. Descarga MongoDB Community Server desde:');
  console.error('      https://www.mongodb.com/try/download/community');
  console.error('   2. Ejecuta el instalador');
  console.error('   3. Asegúrate de instalar MongoDB como servicio');
  console.error('\n   O instala MongoDB manualmente y agrégalo al PATH');
  process.exit(1);
}

console.log(`✅ MongoDB encontrado en: ${mongodPath}`);

// Verificar si ya está corriendo
try {
  execSync('mongosh --eval "db.adminCommand(\'ping\')"', { stdio: 'pipe' });
  console.log('✅ MongoDB ya está corriendo');
  process.exit(0);
} catch (error) {
  console.log('⚠️  MongoDB no está corriendo, intentando iniciar...');
}

// Crear directorio de datos si no existe
const dataDir = path.join(process.cwd(), 'data', 'db');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`✅ Directorio de datos creado: ${dataDir}`);
}

// Intentar iniciar como servicio primero
try {
  console.log('Intentando iniciar MongoDB como servicio...');
  execSync('net start MongoDB', { stdio: 'pipe' });
  console.log('✅ MongoDB iniciado como servicio');
  console.log('\n💡 MongoDB está corriendo. Puedes ejecutar: npm run dev');
  process.exit(0);
} catch (error) {
  console.log('⚠️  No se pudo iniciar como servicio, iniciando manualmente...');
  
  // Iniciar MongoDB manualmente
  const mongodProcess = spawn(mongodPath, [
    '--dbpath', dataDir,
    '--port', '27017'
  ], {
    detached: false,
    stdio: 'inherit'
  });

  mongodProcess.on('error', (error) => {
    console.error('❌ Error al iniciar MongoDB:', error.message);
    process.exit(1);
  });

  mongodProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ MongoDB se cerró con código: ${code}`);
      process.exit(1);
    }
  });

  console.log('✅ MongoDB iniciado manualmente');
  console.log('⚠️  Presiona Ctrl+C para detener MongoDB');
  console.log('\n💡 En otra terminal, ejecuta: npm run dev');
  
  // Mantener el proceso corriendo
  process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo MongoDB...');
    mongodProcess.kill();
    process.exit(0);
  });
}

