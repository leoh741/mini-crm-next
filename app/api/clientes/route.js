import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Client from '../../../models/Client';
import mongoose from 'mongoose';

export async function GET() {
  try {
    await connectDB();
    
    // Logging para diagnóstico
    console.log('[API Clientes] Conectado a MongoDB');
    console.log('[API Clientes] Base de datos:', mongoose.connection.db?.databaseName || 'N/A');
    console.log('[API Clientes] Estado de conexión:', mongoose.connection.readyState);
    
    // Contar documentos primero para diagnóstico
    const count = await Client.countDocuments({});
    console.log('[API Clientes] Total de documentos en la colección:', count);
    
    // Optimización para servidor VPS local: queries más rápidas con índices
    // El índice en createdAt hace el sort más rápido
    const clientes = await Client.find({})
      .select('crmId nombre rubro ciudad email montoPago fechaPago pagado pagoUnico pagoMesSiguiente servicios observaciones createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean() // Usar lean() para obtener objetos planos (más rápido, sin overhead de Mongoose)
      .maxTimeMS(30000); // Timeout aumentado a 30 segundos para servidor VPS
    
    console.log('[API Clientes] Documentos encontrados:', clientes.length);
    
    return NextResponse.json({ success: true, data: clientes }, {
      headers: {
        'Cache-Control': 'no-store', // Desactivar caché temporalmente para diagnóstico
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API Clientes] Error completo:', error);
    console.error('[API Clientes] Stack:', error.stack);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    
    // Generar crmId si no viene
    if (!body.crmId) {
      body.crmId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Optimizado para servidor VPS: validadores habilitados pero con timeout adecuado
    const cliente = await Client.create(body, { 
      runValidators: true, // Habilitar validadores para integridad de datos
      maxTimeMS: 30000 // Timeout aumentado a 30 segundos para servidor VPS
    });
    return NextResponse.json({ success: true, data: cliente }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

