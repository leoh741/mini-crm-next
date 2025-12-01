// Script para configurar MongoDB local para desarrollo
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupLocalMongoDB() {
  console.log('🔧 Configurando MongoDB Local para Desarrollo\n');
  console.log('='.repeat(60));

  // 1. Verificar si MongoDB está instalado
  console.log('\n📦 1. Verificando instalación de MongoDB...');
  try {
    const mongodVersion = execSync('mongod --version', { encoding: 'utf8', stdio: 'pipe' });
    console.log('✅ MongoDB está instalado');
    console.log(mongodVersion.split('\n')[0]);
  } catch (error) {
    console.log('❌ MongoDB no está instalado');
    console.log('\n📥 Instalación de MongoDB:');
    console.log('   Windows:');
    console.log('   1. Descarga MongoDB Community Server desde: https://www.mongodb.com/try/download/community');
    console.log('   2. Ejecuta el instalador');
    console.log('   3. Asegúrate de instalar MongoDB como servicio');
    console.log('\n   macOS:');
    console.log('   brew tap mongodb/brew');
    console.log('   brew install mongodb-community');
    console.log('\n   Linux:');
    console.log('   Sigue las instrucciones en: https://www.mongodb.com/docs/manual/installation/');
    rl.close();
    process.exit(1);
  }

  // 2. Verificar si MongoDB está corriendo
  console.log('\n🔄 2. Verificando si MongoDB está corriendo...');
  try {
    execSync('mongosh --eval "db.adminCommand(\'ping\')"', { encoding: 'utf8', stdio: 'pipe' });
    console.log('✅ MongoDB está corriendo');
  } catch (error) {
    console.log('⚠️  MongoDB no está corriendo');
    const start = await question('¿Quieres iniciar MongoDB ahora? (s/n): ');
    if (start.toLowerCase() === 's' || start.toLowerCase() === 'y') {
      console.log('Iniciando MongoDB...');
      try {
        // Intentar iniciar como servicio (Windows)
        execSync('net start MongoDB', { stdio: 'pipe' });
        console.log('✅ MongoDB iniciado como servicio');
      } catch (error) {
        // Si no es servicio, intentar iniciar manualmente
        console.log('⚠️  No se pudo iniciar como servicio. Inicia MongoDB manualmente:');
        console.log('   Windows: net start MongoDB');
        console.log('   macOS/Linux: brew services start mongodb-community (o mongod)');
      }
    } else {
      console.log('⚠️  Asegúrate de iniciar MongoDB antes de continuar');
    }
  }

  // 3. Crear archivo .env.local si no existe
  console.log('\n📝 3. Configurando archivo .env.local...');
  const envLocalPath = path.join(process.cwd(), '.env.local');
  const envExamplePath = path.join(process.cwd(), '.env.local.example');

  if (fs.existsSync(envLocalPath)) {
    console.log('⚠️  .env.local ya existe');
    const overwrite = await question('¿Quieres sobrescribirlo? (s/n): ');
    if (overwrite.toLowerCase() !== 's' && overwrite.toLowerCase() !== 'y') {
      console.log('✅ Manteniendo .env.local existente');
      rl.close();
      return;
    }
  }

  // Leer ejemplo si existe
  let envContent = '';
  if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, 'utf8');
  } else {
    envContent = `# Configuración para desarrollo local
MONGODB_URI=mongodb://127.0.0.1:27017/mini-crm-dev
`;
  }

  // Preguntar si quiere usar autenticación
  const useAuth = await question('\n¿Quieres usar autenticación en MongoDB local? (s/n): ');
  if (useAuth.toLowerCase() === 's' || useAuth.toLowerCase() === 'y') {
    const username = await question('Usuario MongoDB: ');
    const password = await question('Contraseña MongoDB: ');
    const dbName = await question('Nombre de base de datos (default: mini-crm-dev): ') || 'mini-crm-dev';
    envContent = `# Configuración para desarrollo local
MONGODB_URI=mongodb://${username}:${password}@127.0.0.1:27017/${dbName}?authSource=admin
`;
  } else {
    const dbName = await question('Nombre de base de datos (default: mini-crm-dev): ') || 'mini-crm-dev';
    envContent = `# Configuración para desarrollo local
MONGODB_URI=mongodb://127.0.0.1:27017/${dbName}
`;
  }

  fs.writeFileSync(envLocalPath, envContent);
  console.log('✅ Archivo .env.local creado');

  // 4. Verificar conexión
  console.log('\n🔌 4. Verificando conexión a MongoDB local...');
  try {
    const dbName = envContent.match(/mongodb:\/\/[^\/]+\/([^?]+)/)?.[1] || 'mini-crm-dev';
    execSync(`mongosh --eval "use ${dbName}; db.getName()"`, { encoding: 'utf8', stdio: 'pipe' });
    console.log(`✅ Conexión exitosa a la base de datos: ${dbName}`);
  } catch (error) {
    console.log('⚠️  No se pudo verificar la conexión. Asegúrate de que MongoDB esté corriendo.');
  }

  // 5. Crear índices si es necesario
  console.log('\n📊 5. ¿Quieres crear los índices necesarios?');
  const createIndexes = await question('(Esto ejecutará npm run create-indexes) (s/n): ');
  if (createIndexes.toLowerCase() === 's' || createIndexes.toLowerCase() === 'y') {
    try {
      console.log('Creando índices...');
      execSync('npm run create-indexes', { stdio: 'inherit' });
      console.log('✅ Índices creados');
    } catch (error) {
      console.log('⚠️  Error al crear índices:', error.message);
    }
  }

  console.log('\n✅ Configuración completada!');
  console.log('\n📋 Próximos pasos:');
  console.log('   1. Verifica que .env.local tenga la configuración correcta');
  console.log('   2. Ejecuta: npm run dev');
  console.log('   3. La aplicación usará MongoDB local automáticamente');
  console.log('\n💡 Tip: Para importar datos de producción, usa la función de importar backup');
  console.log('   desde la aplicación web (usará la base de datos local)');

  rl.close();
}

setupLocalMongoDB().catch(error => {
  console.error('❌ Error:', error);
  rl.close();
  process.exit(1);
});

