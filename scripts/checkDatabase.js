// Script para verificar el estado de la base de datos y buscar problemas
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mini-crm';

async function checkDatabase() {
  try {
    console.log('🔍 Verificando estado de la base de datos...\n');
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Verificar colecciones y contar documentos
    const collections = ['clients', 'monthlypayments', 'expenses', 'incomes', 'budgets', 'meetings', 'tasks', 'users'];
    
    console.log('📊 Estado de las colecciones:');
    console.log('='.repeat(50));
    
    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        console.log(`${collectionName.padEnd(20)}: ${count} documentos`);
        
        // Si hay documentos, mostrar algunos ejemplos
        if (count > 0 && count <= 5) {
          const docs = await collection.find({}).limit(3).toArray();
          console.log(`  └─ Ejemplos: ${docs.length} documentos encontrados`);
        }
      } catch (err) {
        console.log(`${collectionName.padEnd(20)}: ERROR - ${err.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Verificar si hay logs recientes de borrado
    console.log('\n🔍 Buscando logs de borrado recientes...');
    console.log('   (Revisa los logs de PM2 con: pm2 logs crm-nextjs --lines 1000 | grep -i "deleteMany\\|eliminados\\|borrar")');
    
    // Verificar última modificación de documentos
    console.log('\n📅 Verificando última modificación de documentos...');
    const clientCollection = db.collection('clients');
    const clientCount = await clientCollection.countDocuments();
    
    if (clientCount > 0) {
      const lastClient = await clientCollection.find({}).sort({ updatedAt: -1 }).limit(1).toArray();
      if (lastClient.length > 0) {
        console.log(`   Último cliente modificado: ${lastClient[0].updatedAt || 'N/A'}`);
        console.log(`   Nombre: ${lastClient[0].nombre || 'N/A'}`);
      }
    } else {
      console.log('   ⚠️ No hay clientes en la base de datos');
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Verificación completada');
    
  } catch (error) {
    console.error('❌ Error al verificar la base de datos:', error);
    process.exit(1);
  }
}

checkDatabase();
<<<<<<< HEAD
=======

>>>>>>> 93db2a91f398f485ea6347608c554af6f7ebfa3d
