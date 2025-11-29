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
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mini-crm';

async function checkDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('   ✅ Conectado a MongoDB');
    console.log('   Base de datos:', mongoose.connection.db?.databaseName || 'N/A');
    
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
    for (const [name, collection] of Object.entries(collections)) {
      try {
        const count = await collection.countDocuments({});
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
  const envPath = path.join(process.cwd(), '.env.local');
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
    console.log('   ⚠️  Archivo .env.local no encontrado');
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

