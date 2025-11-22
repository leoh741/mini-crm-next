const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Definir esquema de usuario
const UserSchema = new mongoose.Schema({
  crmId: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  rol: { type: String, default: 'usuario' },
  fechaCreacion: Date
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function createUser() {
  try {
    // Conectar a MongoDB
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI no está definida en .env.local');
    }

    console.log('Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Datos del usuario
    const email = 'leoh741@gmail.com';
    const password = 'Leonel1234';
    const nombre = 'Leoh741';
    const rol = 'admin';

    // Verificar si el usuario ya existe
    const usuarioExistente = await User.findOne({ 
      email: email.toLowerCase().trim() 
    });

    if (usuarioExistente) {
      console.log('⚠️  El usuario ya existe. Actualizando...');
      usuarioExistente.password = password;
      usuarioExistente.nombre = nombre;
      usuarioExistente.rol = rol;
      await usuarioExistente.save();
      console.log('✅ Usuario actualizado correctamente');
      console.log(`   Email: ${usuarioExistente.email}`);
      console.log(`   Nombre: ${usuarioExistente.nombre}`);
      console.log(`   Rol: ${usuarioExistente.rol}`);
    } else {
      // Crear nuevo usuario
      const usuarioData = {
        crmId: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        nombre: nombre,
        email: email.toLowerCase().trim(),
        password: password,
        rol: rol,
        fechaCreacion: new Date()
      };

      const usuario = await User.create(usuarioData);
      console.log('✅ Usuario creado correctamente');
      console.log(`   ID: ${usuario._id}`);
      console.log(`   CRM ID: ${usuario.crmId}`);
      console.log(`   Email: ${usuario.email}`);
      console.log(`   Nombre: ${usuario.nombre}`);
      console.log(`   Rol: ${usuario.rol}`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Proceso completado');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 11000) {
      console.error('   El email ya está en uso. Intentando actualizar...');
      // Intentar actualizar el usuario existente
      try {
        const usuario = await User.findOneAndUpdate(
          { email: 'leoh741@gmail.com'.toLowerCase().trim() },
          { 
            password: 'Leonel1234',
            nombre: 'Leoh741',
            rol: 'admin'
          },
          { new: true }
        );
        if (usuario) {
          console.log('✅ Usuario actualizado correctamente');
        }
      } catch (updateError) {
        console.error('   Error al actualizar:', updateError.message);
      }
    }
    await mongoose.connection.close();
    process.exit(1);
  }
}

createUser();

