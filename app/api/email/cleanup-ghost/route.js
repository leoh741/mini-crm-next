// API route para limpiar correos "fantasma" del cache
// POST /api/email/cleanup-ghost
// Elimina correos sin metadata mínima (sin remitente, sin asunto, sin fecha)

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "../../../../lib/mongo.js";

export const dynamic = 'force-dynamic';

// Schema para EmailCache (debe coincidir con el de emailCache.js)
const EmailCacheSchema = new mongoose.Schema({
  uid: { type: Number, required: true, index: true },
  carpeta: { type: String, required: true, index: true },
  cacheKey: { type: String, required: true, unique: true, index: true },
  mensaje: {
    uid: Number,
    subject: String,
    from: String,
    date: Date,
    to: String,
    text: String,
    html: String,
    flags: [String],
    leido: Boolean,
  },
  incluyeContenido: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { strict: false });

const EmailCache = mongoose.models.EmailCache || mongoose.model('EmailCache', EmailCacheSchema);

export async function POST(request) {
  try {
    await connectDB();
    
    console.log('🧹 Iniciando limpieza de correos "fantasma" del cache...');
    
    // Buscar correos sin metadata mínima en INBOX
    // Un correo "fantasma" es aquel que:
    // - Tiene carpeta = 'INBOX' (o variaciones)
    // - Y NO tiene remitente válido (null, vacío, o "Sin remitente")
    // - Y NO tiene asunto válido (null, vacío, o "(Sin asunto)")
    const query = {
      $or: [
        { carpeta: 'INBOX' },
        { carpeta: 'inbox' },
        { carpeta: 'Inbox' }
      ],
      $and: [
        {
          $or: [
            { 'mensaje.from': null },
            { 'mensaje.from': '' },
            { 'mensaje.from': 'Sin remitente' }
          ]
        },
        {
          $or: [
            { 'mensaje.subject': null },
            { 'mensaje.subject': '' },
            { 'mensaje.subject': '(Sin asunto)' }
          ]
        }
      ]
    };
    
    // Contar cuántos correos fantasma hay
    const count = await EmailCache.countDocuments(query);
    console.log(`📊 Encontrados ${count} correo(s) "fantasma" en INBOX`);
    
    if (count === 0) {
      return NextResponse.json({
        success: true,
        message: 'No se encontraron correos "fantasma" para limpiar',
        deleted: 0
      });
    }
    
    // Eliminar correos fantasma
    const result = await EmailCache.deleteMany(query);
    
    console.log(`✅ Limpieza completada: ${result.deletedCount} correo(s) "fantasma" eliminado(s)`);
    
    return NextResponse.json({
      success: true,
      message: `Se eliminaron ${result.deletedCount} correo(s) "fantasma" del cache`,
      deleted: result.deletedCount,
      found: count
    });
    
  } catch (error) {
    console.error('❌ Error en limpieza de correos fantasma:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error desconocido al limpiar correos fantasma'
      },
      { status: 500 }
    );
  }
}

