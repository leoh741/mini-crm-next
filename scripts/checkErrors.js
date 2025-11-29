// Script para verificar errores y estado del sistema en el VPS
const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando errores y estado del sistema...\n');
console.log('='.repeat(60));

// 1. Verificar logs de auditoría
console.log('\n📋 1. LOGS DE AUDITORÍA (últimas 50 líneas):');
console.log('-'.repeat(60));
const auditLogPath = path.join(process.cwd(), 'logs', 'audit.log');
if (fs.existsSync(auditLogPath)) {
  const auditLog = fs.readFileSync(auditLogPath, 'utf8');
  const lines = auditLog.split('\n').filter(line => line.trim());
  const lastLines = lines.slice(-50);
  if (lastLines.length > 0) {
    lastLines.forEach(line => console.log(line));
  } else {
    console.log('   No hay entradas en el log de auditoría');
  }
} else {
  console.log('   ⚠️  Archivo de log de auditoría no encontrado');
  console.log('   Ruta esperada:', auditLogPath);
}

// 2. Buscar operaciones de borrado recientes
console.log('\n🗑️  2. OPERACIONES DE BORRADO RECIENTES:');
console.log('-'.repeat(60));
if (fs.existsSync(auditLogPath)) {
  const auditLog = fs.readFileSync(auditLogPath, 'utf8');
  const deleteLines = auditLog.split('\n').filter(line => 
    line.includes('DELETE_OPERATION') || 
    line.includes('ELIMINACIÓN DE DATOS') ||
    line.includes('deleteMany')
  );
  if (deleteLines.length > 0) {
    console.log(`   Se encontraron ${deleteLines.length} operaciones de borrado:`);
    deleteLines.slice(-20).forEach((line, index) => {
      console.log(`   ${index + 1}. ${line.substring(0, 200)}...`);
    });
  } else {
    console.log('   ✅ No se encontraron operaciones de borrado recientes');
  }
} else {
  console.log('   ⚠️  No se puede verificar (log no encontrado)');
}

// 3. Verificar estado de la base de datos
console.log('\n💾 3. ESTADO DE LA BASE DE DATOS:');
console.log('-'.repeat(60));
const mongoose = require('mongoose');

// Intentar cargar .env.local, si no existe, intentar .env
let envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.log('   ⚠️  No se encontró .env.local ni .env');
    console.log('   Usando configuración por defecto');
  }
}

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mini-crm';
console.log('   URI de conexión:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

async function checkDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('   ✅ Conectado a MongoDB');
    const dbName = mongoose.connection.db?.databaseName || 'N/A';
    console.log('   Base de datos:', dbName);
    
    // Verificar si hay otras bases de datos
    const adminDb = mongoose.connection.db.admin();
    const dbs = await adminDb.listDatabases();
    console.log('\n   Bases de datos disponibles:');
    dbs.databases.forEach(db => {
      const size = (db.sizeOnDisk / 1024 / 1024).toFixed(2);
      const marker = db.name === dbName ? ' ← ACTUAL' : '';
      console.log(`      - ${db.name} (${size} MB)${marker}`);
    });
    
    const collections = {
      'Client': mongoose.connection.db.collection('clients'),
      'MonthlyPayment': mongoose.connection.db.collection('monthlypayments'),
      'Expense': mongoose.connection.db.collection('expenses'),
      'Income': mongoose.connection.db.collection('incomes'),
      'Budget': mongoose.connection.db.collection('budgets'),
      'Meeting': mongoose.connection.db.collection('meetings'),
      'Task': mongoose.connection.db.collection('tasks'),
      'User': mongoose.connection.db.collection('users')
    };
    
    console.log('\n   Conteo de documentos:');
    let totalDocs = 0;
    for (const [name, collection] of Object.entries(collections)) {
      try {
        const count = await collection.countDocuments({});
        totalDocs += count;
        const status = count > 0 ? '✅' : '⚠️';
        console.log(`   ${status} ${name.padEnd(20)}: ${count} documentos`);
        
        // Si hay documentos, mostrar el último modificado
        if (count > 0 && name === 'Client') {
          const lastDoc = await collection.find({})
            .sort({ updatedAt: -1 })
            .limit(1)
            .toArray();
          if (lastDoc.length > 0) {
            console.log(`      └─ Último cliente: ${lastDoc[0].nombre || 'N/A'} (${lastDoc[0].updatedAt || 'N/A'})`);
          }
        }
      } catch (err) {
        console.log(`   ❌ ${name.padEnd(20)}: ERROR - ${err.message}`);
      }
    }
    
    if (totalDocs === 0) {
      console.log('\n   ⚠️  ADVERTENCIA: La base de datos está completamente vacía');
      console.log('   Esto puede indicar:');
      console.log('      1. Los datos se borraron');
      console.log('      2. Estás conectado a la base de datos incorrecta');
      console.log('      3. Los datos están en otra base de datos');
      console.log('\n   Verifica:');
      console.log('      - La URI de conexión en .env.local');
      console.log('      - Si hay backups disponibles');
      console.log('      - Los logs de auditoría para ver qué pasó');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('   ❌ Error al conectar a MongoDB:', error.message);
  }
}

checkDatabase().then(() => {
  // 4. Verificar archivos de log del servidor
  console.log('\n📄 4. LOGS DEL SERVIDOR:');
  console.log('-'.repeat(60));
  
  const serverLogPath = path.join(process.cwd(), 'server.log');
  if (fs.existsSync(serverLogPath)) {
    const serverLog = fs.readFileSync(serverLogPath, 'utf8');
    const lines = serverLog.split('\n').filter(line => line.trim());
    const errorLines = lines.filter(line => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('delete') ||
      line.toLowerCase().includes('borrar')
    );
    
    if (errorLines.length > 0) {
      console.log(`   Se encontraron ${errorLines.length} líneas con errores o borrados:`);
      errorLines.slice(-20).forEach((line, index) => {
        console.log(`   ${index + 1}. ${line.substring(0, 200)}...`);
      });
    } else {
      console.log('   ✅ No se encontraron errores recientes en server.log');
    }
  } else {
    console.log('   ℹ️  Archivo server.log no encontrado');
    console.log('   (Ejecuta: npm run dev:log para generar logs)');
  }
  
  // 5. Verificar variables de entorno
  console.log('\n⚙️  5. CONFIGURACIÓN:');
  console.log('-'.repeat(60));
  
  // Buscar .env.local primero, luego .env
  let envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    envPath = path.join(process.cwd(), '.env');
  }
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const mongoUri = envContent.split('\n').find(line => line.startsWith('MONGODB_URI='));
    if (mongoUri) {
      // Ocultar credenciales
      const safeUri = mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
      console.log('   MONGODB_URI:', safeUri);
      
      // Extraer nombre de base de datos
      const dbMatch = mongoUri.match(/\/([^\/\?]+)(\?|$)/);
      if (dbMatch) {
        console.log('   Base de datos:', dbMatch[1]);
      }
    } else {
      console.log('   ⚠️  MONGODB_URI no encontrada en .env.local');
    }
  } else {
    console.log('   ⚠️  Archivo .env.local o .env no encontrado');
    console.log('   Buscando en:', process.cwd());
    console.log('   Archivos .env encontrados:');
    const files = fs.readdirSync(process.cwd()).filter(f => f.includes('.env'));
    if (files.length > 0) {
      files.forEach(f => console.log(`      - ${f}`));
    } else {
      console.log('      (ninguno)');
    }
  }
  
  // 6. Resumen
  console.log('\n📊 RESUMEN:');
  console.log('-'.repeat(60));
  console.log('   Para ver más detalles:');
  console.log('   - Logs de auditoría: cat logs/audit.log | tail -100');
  console.log('   - Logs del servidor: cat server.log | tail -100');
  console.log('   - Verificar BD: npm run check-db');
  console.log('   - Ver procesos: pm2 list (si usas PM2)');
  console.log('\n✅ Verificación completada\n');
  
  process.exit(0);
});

