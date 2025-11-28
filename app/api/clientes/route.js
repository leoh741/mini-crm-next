import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Client from '../../../models/Client';
import mongoose from 'mongoose';

export async function GET() {
  try {
    await connectDB();
    
    // Logging solo en desarrollo para diagnóstico
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      console.log('[API Clientes] Conectado a MongoDB');
      console.log('[API Clientes] Base de datos:', mongoose.connection.db?.databaseName || 'N/A');
      console.log('[API Clientes] Estado de conexión:', mongoose.connection.readyState);
    }
    
    // Optimización para servidor VPS: queries más rápidas con índices y límites
    // El índice en createdAt hace el sort más rápido
    // IMPORTANTE: Incluir _id explícitamente para que esté disponible
    const clientes = await Client.find({})
      .select('_id crmId nombre rubro ciudad email montoPago fechaPago pagado pagoUnico pagoMesSiguiente servicios observaciones createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean() // Usar lean() para obtener objetos planos (más rápido, sin overhead de Mongoose)
      .maxTimeMS(15000); // Timeout optimizado para VPS (15 segundos)
      // Nota: No agregamos límite aquí porque necesitamos todos los clientes
    
    if (isDevelopment && clientes.length > 0) {
      console.log('[API Clientes] Documentos encontrados:', clientes.length);
    }
    
    return NextResponse.json({ success: true, data: clientes }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', // Cache optimizado para producción
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
      body.crmId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

