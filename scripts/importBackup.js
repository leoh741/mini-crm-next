const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Definir esquemas directamente aquí para evitar problemas con ES modules
const ClientSchema = new mongoose.Schema({
  crmId: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  rubro: String,
  ciudad: String,
  email: String,
  montoPago: Number,
  fechaPago: Number,
  pagado: { type: Boolean, default: false },
  pagoUnico: { type: Boolean, default: false },
  pagoMesSiguiente: { type: Boolean, default: false },
  servicios: [{ nombre: String, precio: Number }],
  observaciones: String
}, { timestamps: true });

const MonthlyPaymentSchema = new mongoose.Schema({
  mes: { type: String, required: true, index: true },
  crmClientId: { type: String, required: true, index: true },
  pagado: { type: Boolean, default: false },
  fechaActualizacion: Date
}, { timestamps: true });

MonthlyPaymentSchema.index({ mes: 1, crmClientId: 1 }, { unique: true });

const ExpenseSchema = new mongoose.Schema({
  periodo: { type: String, required: true, index: true },
  crmId: { type: String, required: true },
  descripcion: { type: String, required: true },
  monto: { type: Number, required: true },
  fecha: Date,
  categoria: String,
  fechaCreacion: Date
}, { timestamps: true });

const IncomeSchema = new mongoose.Schema({
  periodo: { type: String, required: true, index: true },
  crmId: { type: String, required: true },
  descripcion: { type: String, required: true },
  monto: { type: Number, required: true },
  fecha: Date,
  categoria: String,
  fechaCreacion: Date
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  crmId: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  rol: { type: String, default: 'usuario' },
  fechaCreacion: Date
}, { timestamps: true });

const Client = mongoose.models.Client || mongoose.model('Client', ClientSchema);
const MonthlyPayment = mongoose.models.MonthlyPayment || mongoose.model('MonthlyPayment', MonthlyPaymentSchema);
const Expense = mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);
const Income = mongoose.models.Income || mongoose.model('Income', IncomeSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function importBackup() {
  try {
    // Conectar a MongoDB
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI no está definida en .env.local');
    }

    console.log('Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Leer archivo de backup
    const backupPath = path.join(__dirname, '../data/crm_backup.json');
    if (!fs.existsSync(backupPath)) {
      throw new Error(`No se encontró el archivo de backup en: ${backupPath}`);
    }

    console.log('Leyendo archivo de backup...');
    const rawBackup = fs.readFileSync(backupPath, 'utf8');
    const backup = JSON.parse(rawBackup);

    // Parsear los datos (vienen como strings JSON)
    const clientes = JSON.parse(backup.clientes || '[]');
    const pagosMensuales = JSON.parse(backup.pagosMensuales || '{}');
    const gastos = JSON.parse(backup.gastos || '{}');
    const ingresos = JSON.parse(backup.ingresos || '{}');
    const usuarios = JSON.parse(backup.usuarios || '[]');

    console.log('\nLimpiando colecciones existentes...');
    await Client.deleteMany({});
    await MonthlyPayment.deleteMany({});
    await Expense.deleteMany({});
    await Income.deleteMany({});
    await User.deleteMany({});
    console.log('✅ Colecciones limpiadas');

    // Importar clientes
    console.log('\nImportando clientes...');
    const clientesImportados = [];
    for (const cliente of clientes) {
      const clienteData = {
        crmId: cliente.id || `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        nombre: cliente.nombre,
        rubro: cliente.rubro,
        ciudad: cliente.ciudad,
        email: cliente.email,
        montoPago: cliente.montoPago,
        fechaPago: cliente.fechaPago,
        pagado: cliente.pagado || false,
        pagoUnico: cliente.pagoUnico || false,
        pagoMesSiguiente: cliente.pagoMesSiguiente || false,
        servicios: cliente.servicios || [],
        observaciones: cliente.observaciones
      };
      clientesImportados.push(clienteData);
    }
    if (clientesImportados.length > 0) {
      await Client.insertMany(clientesImportados);
    }
    console.log(`✅ Clientes importados: ${clientesImportados.length}`);

    // Importar pagos mensuales
    console.log('\nImportando pagos mensuales...');
    let pagosImportados = 0;
    for (const [mes, pagosDelMes] of Object.entries(pagosMensuales)) {
      for (const [crmClientId, datosPago] of Object.entries(pagosDelMes)) {
        const pagoData = {
          mes,
          crmClientId,
          pagado: datosPago.pagado || false,
          fechaActualizacion: datosPago.fechaActualizacion ? new Date(datosPago.fechaActualizacion) : null
        };
        await MonthlyPayment.create(pagoData);
        pagosImportados++;
      }
    }
    console.log(`✅ Pagos mensuales importados: ${pagosImportados}`);

    // Importar gastos
    console.log('\nImportando gastos...');
    let gastosImportados = 0;
    for (const [periodo, gastosDelPeriodo] of Object.entries(gastos)) {
      if (Array.isArray(gastosDelPeriodo)) {
        for (const gasto of gastosDelPeriodo) {
          const gastoData = {
            periodo,
            crmId: gasto.id || `expense-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            descripcion: gasto.descripcion,
            monto: parseFloat(gasto.monto) || 0,
            fecha: gasto.fecha ? new Date(gasto.fecha) : null,
            categoria: gasto.categoria || '',
            fechaCreacion: gasto.fechaCreacion ? new Date(gasto.fechaCreacion) : new Date()
          };
          await Expense.create(gastoData);
          gastosImportados++;
        }
      }
    }
    console.log(`✅ Gastos importados: ${gastosImportados}`);

    // Importar ingresos
    console.log('\nImportando ingresos...');
    let ingresosImportados = 0;
    for (const [periodo, ingresosDelPeriodo] of Object.entries(ingresos)) {
      if (Array.isArray(ingresosDelPeriodo)) {
        for (const ingreso of ingresosDelPeriodo) {
          const ingresoData = {
            periodo,
            crmId: ingreso.id || `income-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            descripcion: ingreso.descripcion,
            monto: parseFloat(ingreso.monto) || 0,
            fecha: ingreso.fecha ? new Date(ingreso.fecha) : null,
            categoria: ingreso.categoria || '',
            fechaCreacion: ingreso.fechaCreacion ? new Date(ingreso.fechaCreacion) : new Date()
      };
          await Income.create(ingresoData);
          ingresosImportados++;
        }
      }
    }
    console.log(`✅ Ingresos importados: ${ingresosImportados}`);

    // Importar usuarios
    console.log('\nImportando usuarios...');
    const usuariosImportados = [];
    for (const usuario of usuarios) {
      const usuarioData = {
        crmId: usuario.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        nombre: usuario.nombre,
        email: usuario.email,
        password: usuario.password,
        rol: usuario.rol || 'usuario',
        fechaCreacion: usuario.fechaCreacion ? new Date(usuario.fechaCreacion) : new Date()
      };
      usuariosImportados.push(usuarioData);
    }
    if (usuariosImportados.length > 0) {
      await User.insertMany(usuariosImportados);
    }
    console.log(`✅ Usuarios importados: ${usuariosImportados.length}`);

    console.log('\n🎉 Importación completada exitosamente!');
    console.log('\nResumen:');
    console.log(`  - Clientes: ${clientesImportados.length}`);
    console.log(`  - Pagos mensuales: ${pagosImportados}`);
    console.log(`  - Gastos: ${gastosImportados}`);
    console.log(`  - Ingresos: ${ingresosImportados}`);
    console.log(`  - Usuarios: ${usuariosImportados.length}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante la importación:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

importBackup();
