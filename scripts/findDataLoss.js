// Script para encontrar cuándo y cómo se perdieron los datos
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

async function findDataLoss() {
  try {
    console.log('🔍 Buscando cuándo y cómo se perdieron los datos...\n');
    
    // 1. Verificar estado actual
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    
    const collections = {
      'Client': db.collection('clients'),
      'MonthlyPayment': db.collection('monthlypayments'),
      'Expense': db.collection('expenses'),
      'Income': db.collection('incomes'),
      'Budget': db.collection('budgets'),
      'Meeting': db.collection('meetings'),
      'Task': db.collection('tasks'),
      'User': db.collection('users')
    };
    
    console.log('📊 Estado actual de la base de datos:');
    console.log('='.repeat(60));
    for (const [name, collection] of Object.entries(collections)) {
      const count = await collection.countDocuments({});
      console.log(`${name.padEnd(20)}: ${count} documentos`);
    }
    
    // 2. Buscar última modificación de documentos
    console.log('\n📅 Última modificación de documentos:');
    console.log('-'.repeat(60));
    for (const [name, collection] of Object.entries(collections)) {
      try {
        const lastDoc = await collection.find({})
          .sort({ updatedAt: -1 })
          .limit(1)
          .toArray();
        if (lastDoc.length > 0 && lastDoc[0].updatedAt) {
          const fecha = new Date(lastDoc[0].updatedAt);
          console.log(`${name.padEnd(20)}: ${fecha.toISOString()} (${fecha.toLocaleString()})`);
        }
      } catch (err) {
        // Ignorar errores
      }
    }
    
    // 3. Revisar logs de auditoría
    console.log('\n📋 Revisando logs de auditoría:');
    console.log('-'.repeat(60));
    const auditLogPath = path.join(process.cwd(), 'logs', 'audit.log');
    if (fs.existsSync(auditLogPath)) {
      const auditLog = fs.readFileSync(auditLogPath, 'utf8');
      const lines = auditLog.split('\n').filter(line => line.trim());
      
      // Buscar operaciones DELETE
      const deleteOps = lines.filter(line => line.includes('DELETE_OPERATION'));
      console.log(`Operaciones DELETE encontradas: ${deleteOps.length}`);
      if (deleteOps.length > 0) {
        console.log('\nÚltimas 10 operaciones DELETE:');
        deleteOps.slice(-10).forEach((line, idx) => {
          try {
            const match = line.match(/\[(.*?)\].*DELETE_OPERATION.*?(\{.*\})/);
            if (match) {
              const timestamp = match[1];
              const data = JSON.parse(match[2]);
              console.log(`\n${idx + 1}. ${timestamp}`);
              console.log(`   Colección: ${data.collection}`);
              console.log(`   Cantidad: ${data.count}`);
              console.log(`   Razón: ${data.reason}`);
              if (data.metadata && data.metadata.timestamp) {
                console.log(`   Timestamp metadata: ${data.metadata.timestamp}`);
              }
            }
          } catch (e) {
            console.log(`   ${line.substring(0, 200)}...`);
          }
        });
      }
      
      // Buscar estados de BD antes/después
      const dbStates = lines.filter(line => 
        line.includes('DB_STATE_BEFORE') || 
        line.includes('DB_STATE_AFTER') ||
        line.includes('IMPORT_SUCCESS') ||
        line.includes('EXPORT_SUCCESS')
      );
      
      console.log(`\nEstados de BD registrados: ${dbStates.length}`);
      if (dbStates.length > 0) {
        console.log('\nÚltimos 5 estados de BD:');
        dbStates.slice(-5).forEach((line, idx) => {
          const match = line.match(/\[(.*?)\].*?\[(.*?)\].*?(\{.*\})/);
          if (match) {
            console.log(`\n${idx + 1}. ${match[1]} - ${match[2]}`);
            try {
              const data = JSON.parse(match[3]);
              if (data.Client !== undefined) {
                console.log(`   Clientes: ${data.Client}`);
              }
            } catch (e) {
              // Ignorar
            }
          }
        });
      }
    } else {
      console.log('⚠️  Archivo de log de auditoría no encontrado');
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Análisis completado\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findDataLoss();

