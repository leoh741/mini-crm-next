// Script para verificar el estado completo de la base de datos y buscar datos en otras bases
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno
let envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  envPath = path.join(process.cwd(), '.env');
}
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mini-crm';

async function checkAllDatabases() {
  try {
    console.log('🔍 Verificando todas las bases de datos en MongoDB...\n');
    
    // Conectar sin especificar base de datos para listar todas
    const baseUri = MONGODB_URI.split('/').slice(0, -1).join('/');
    await mongoose.connect(baseUri + '/admin');
    
    const adminDb = mongoose.connection.db.admin();
    const dbs = await adminDb.listDatabases();
    
    console.log('📊 Bases de datos encontradas:\n');
    
    for (const dbInfo of dbs.databases) {
      if (dbInfo.name === 'admin' || dbInfo.name === 'local' || dbInfo.name === 'config') {
        continue; // Saltar bases del sistema
      }
      
      const sizeMB = (dbInfo.sizeOnDisk / 1024 / 1024).toFixed(2);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📁 Base de datos: ${dbInfo.name} (${sizeMB} MB)`);
      console.log('-'.repeat(60));
      
      // Conectar a esta base de datos
      const db = mongoose.connection.useDb(dbInfo.name);
      
      // Verificar colecciones relevantes
      const collections = ['clients', 'monthlypayments', 'expenses', 'incomes', 'budgets', 'meetings', 'tasks', 'users'];
      let hasData = false;
      
      for (const collName of collections) {
        try {
          const collection = db.collection(collName);
          const count = await collection.countDocuments({});
          if (count > 0) {
            hasData = true;
            console.log(`   ✅ ${collName.padEnd(20)}: ${count} documentos`);
            
            // Si es clients, mostrar algunos nombres
            if (collName === 'clients' && count > 0) {
              const samples = await collection.find({})
                .select('nombre crmId updatedAt')
                .sort({ updatedAt: -1 })
                .limit(3)
                .toArray();
              console.log(`      Ejemplos:`);
              samples.forEach(c => {
                const fecha = c.updatedAt ? new Date(c.updatedAt).toLocaleString() : 'N/A';
                console.log(`         - ${c.nombre || 'Sin nombre'} (${c.crmId || 'N/A'}) - ${fecha}`);
              });
            }
          }
        } catch (err) {
          // Colección no existe, continuar
        }
      }
      
      if (!hasData) {
        console.log(`   ⚠️  No se encontraron datos en las colecciones relevantes`);
      }
    }
    
    // Verificar la base de datos configurada
    const targetDbName = MONGODB_URI.split('/').pop().split('?')[0];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 Base de datos configurada: ${targetDbName}`);
    console.log('-'.repeat(60));
    
    const targetDb = mongoose.connection.useDb(targetDbName);
    let totalInTarget = 0;
    
    for (const collName of collections) {
      try {
        const collection = targetDb.collection(collName);
        const count = await collection.countDocuments({});
        totalInTarget += count;
        if (count > 0) {
          console.log(`   ✅ ${collName.padEnd(20)}: ${count} documentos`);
        }
      } catch (err) {
        // Colección no existe
      }
    }
    
    if (totalInTarget === 0) {
      console.log(`   ⚠️  La base de datos configurada está vacía`);
      console.log(`\n💡 Recomendaciones:`);
      console.log(`   1. Verifica si los datos están en otra base de datos (ver arriba)`);
      console.log(`   2. Revisa si hay backups disponibles`);
      console.log(`   3. Verifica los logs: npm run check-errors`);
      console.log(`   4. Revisa la configuración de MONGODB_URI en .env.local`);
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Verificación completada\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAllDatabases();

