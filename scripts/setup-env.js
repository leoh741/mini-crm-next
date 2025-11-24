const fs = require('fs');
const path = require('path');

const envLocalPath = path.join(__dirname, '..', '.env.local');
const envExamplePath = path.join(__dirname, '..', 'ENV_LOCAL_EJEMPLO.txt');

console.log('🔧 Configurando archivo .env.local para MongoDB local...\n');

// Verificar si ya existe .env.local
if (fs.existsSync(envLocalPath)) {
  console.log('⚠️  El archivo .env.local ya existe.');
  console.log('   Si quieres recrearlo, elimínalo primero.\n');
  process.exit(0);
}

// Leer el ejemplo
let envContent = '';
if (fs.existsSync(envExamplePath)) {
  const exampleContent = fs.readFileSync(envExamplePath, 'utf8');
  // Extraer solo las líneas de configuración (sin comentarios de instrucciones)
  const lines = exampleContent.split('\n');
  envContent = lines
    .filter(line => line.trim() && !line.trim().startsWith('# INSTRUCCIONES'))
    .join('\n');
} else {
  // Si no existe el ejemplo, crear contenido por defecto
  envContent = `# Configuración para MongoDB local en el mismo VPS
MONGODB_URI=mongodb://localhost:27017/mini-crm
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# NOTAS:
# - Si MongoDB tiene autenticación, usa: mongodb://usuario:password@localhost:27017/mini-crm
# - Si MongoDB está en otro puerto, cambia 27017 por el puerto correcto
# - El nombre de la base de datos es "mini-crm" (puedes cambiarlo si quieres)
# - En producción, actualiza NEXT_PUBLIC_BASE_URL con tu dominio real
`;
}

// Escribir el archivo
try {
  fs.writeFileSync(envLocalPath, envContent, 'utf8');
  console.log('✅ Archivo .env.local creado exitosamente!\n');
  console.log('📝 Contenido:');
  console.log('─'.repeat(50));
  console.log(envContent);
  console.log('─'.repeat(50));
  console.log('\n💡 Próximos pasos:');
  console.log('   1. Revisa y ajusta MONGODB_URI si es necesario');
  console.log('   2. Asegúrate de que MongoDB esté corriendo');
  console.log('   3. Ejecuta: npm run dev\n');
} catch (error) {
  console.error('❌ Error al crear .env.local:', error.message);
  process.exit(1);
}

