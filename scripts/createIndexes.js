// Script para crear índices en MongoDB
// Ejecutar: node scripts/createIndexes.js
// Esto optimiza las queries y mejora el rendimiento

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI no está definida en las variables de entorno');
  process.exit(1);
}

async function createIndexes() {
  try {
    console.log('Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✓ Conectado a MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Crear índices para la colección 'clients'
    console.log('Creando índices para Client...');
    const clientsCollection = db.collection('clients');
    
    await clientsCollection.createIndex({ crmId: 1 }, { unique: true, name: 'crmId_1' });
    console.log('  ✓ Índice crmId creado');
    
    await clientsCollection.createIndex({ nombre: 1 }, { name: 'nombre_1' });
    console.log('  ✓ Índice nombre creado');
    
    await clientsCollection.createIndex({ rubro: 1 }, { name: 'rubro_1' });
    console.log('  ✓ Índice rubro creado');
    
    await clientsCollection.createIndex({ pagado: 1 }, { name: 'pagado_1' });
    console.log('  ✓ Índice pagado creado');
    
    await clientsCollection.createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
    console.log('  ✓ Índice createdAt creado');
    
    await clientsCollection.createIndex({ pagado: 1, createdAt: -1 }, { name: 'pagado_1_createdAt_-1' });
    console.log('  ✓ Índice compuesto (pagado, createdAt) creado');
    
    await clientsCollection.createIndex({ rubro: 1, pagado: 1 }, { name: 'rubro_1_pagado_1' });
    console.log('  ✓ Índice compuesto (rubro, pagado) creado');
    
    // Crear índices para la colección 'monthlypayments'
    console.log('\nCreando índices para MonthlyPayment...');
    const monthlyPaymentsCollection = db.collection('monthlypayments');
    
    await monthlyPaymentsCollection.createIndex({ mes: 1 }, { name: 'mes_1' });
    console.log('  ✓ Índice mes creado');
    
    await monthlyPaymentsCollection.createIndex({ crmClientId: 1 }, { name: 'crmClientId_1' });
    console.log('  ✓ Índice crmClientId creado');
    
    await monthlyPaymentsCollection.createIndex({ pagado: 1 }, { name: 'pagado_1' });
    console.log('  ✓ Índice pagado creado');
    
    await monthlyPaymentsCollection.createIndex({ fechaActualizacion: 1 }, { name: 'fechaActualizacion_1' });
    console.log('  ✓ Índice fechaActualizacion creado');
    
    await monthlyPaymentsCollection.createIndex({ mes: 1, crmClientId: 1 }, { unique: true, name: 'mes_1_crmClientId_1' });
    console.log('  ✓ Índice compuesto único (mes, crmClientId) creado');
    
    await monthlyPaymentsCollection.createIndex({ mes: 1, pagado: 1 }, { name: 'mes_1_pagado_1' });
    console.log('  ✓ Índice compuesto (mes, pagado) creado');
    
    await monthlyPaymentsCollection.createIndex({ crmClientId: 1, mes: 1, pagado: 1 }, { name: 'crmClientId_1_mes_1_pagado_1' });
    console.log('  ✓ Índice compuesto (crmClientId, mes, pagado) creado');
    
    // Crear índices para la colección 'expenses'
    console.log('\nCreando índices para Expense...');
    const expensesCollection = db.collection('expenses');
    
    await expensesCollection.createIndex({ periodo: 1 }, { name: 'periodo_1' });
    console.log('  ✓ Índice periodo creado');
    
    await expensesCollection.createIndex({ crmId: 1 }, { name: 'crmId_1' });
    console.log('  ✓ Índice crmId creado');
    
    await expensesCollection.createIndex({ fecha: -1 }, { name: 'fecha_-1' });
    console.log('  ✓ Índice fecha creado');
    
    await expensesCollection.createIndex({ categoria: 1 }, { name: 'categoria_1' });
    console.log('  ✓ Índice categoria creado');
    
    await expensesCollection.createIndex({ periodo: 1, fecha: -1 }, { name: 'periodo_1_fecha_-1' });
    console.log('  ✓ Índice compuesto (periodo, fecha) creado');
    
    await expensesCollection.createIndex({ periodo: 1, categoria: 1 }, { name: 'periodo_1_categoria_1' });
    console.log('  ✓ Índice compuesto (periodo, categoria) creado');
    
    // Crear índices para la colección 'incomes'
    console.log('\nCreando índices para Income...');
    const incomesCollection = db.collection('incomes');
    
    await incomesCollection.createIndex({ periodo: 1 }, { name: 'periodo_1' });
    console.log('  ✓ Índice periodo creado');
    
    await incomesCollection.createIndex({ crmId: 1 }, { name: 'crmId_1' });
    console.log('  ✓ Índice crmId creado');
    
    await incomesCollection.createIndex({ fecha: -1 }, { name: 'fecha_-1' });
    console.log('  ✓ Índice fecha creado');
    
    await incomesCollection.createIndex({ categoria: 1 }, { name: 'categoria_1' });
    console.log('  ✓ Índice categoria creado');
    
    await incomesCollection.createIndex({ periodo: 1, fecha: -1 }, { name: 'periodo_1_fecha_-1' });
    console.log('  ✓ Índice compuesto (periodo, fecha) creado');
    
    await incomesCollection.createIndex({ periodo: 1, categoria: 1 }, { name: 'periodo_1_categoria_1' });
    console.log('  ✓ Índice compuesto (periodo, categoria) creado');
    
    // Crear índices para la colección 'users'
    console.log('\nCreando índices para User...');
    const usersCollection = db.collection('users');
    
    await usersCollection.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
    console.log('  ✓ Índice único email creado');
    
    await usersCollection.createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
    console.log('  ✓ Índice createdAt creado');
    
    console.log('\n✓ Todos los índices han sido creados exitosamente');
    console.log('\nNota: Si algunos índices ya existían, MongoDB los ignorará automáticamente.');
    
  } catch (error) {
    console.error('Error al crear índices:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('\nDesconectado de MongoDB');
    }
  }
}

createIndexes();

