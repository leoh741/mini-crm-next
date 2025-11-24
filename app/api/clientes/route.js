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
    console.log('[API Clientes] Nombre del modelo:', Client.modelName);
    console.log('[API Clientes] Nombre de la colección:', Client.collection.name);
    
    // Verificar colecciones disponibles
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('[API Clientes] Colecciones disponibles:', collections.map(c => c.name));
    
    // Intentar contar documentos directamente desde la colección
    const collection = mongoose.connection.db.collection('clients');
    const directCount = await collection.countDocuments({});
    console.log('[API Clientes] Conteo directo desde colección "clients":', directCount);
    
    // Contar documentos usando el modelo
    const count = await Client.countDocuments({});
    console.log('[API Clientes] Total de documentos usando modelo:', count);
    
    // Si hay documentos pero el modelo no los encuentra, intentar sin select
    let clientes = [];
    if (directCount > 0 && count === 0) {
      console.log('[API Clientes] ADVERTENCIA: Hay documentos en la colección pero el modelo no los encuentra');
      // Intentar obtener directamente desde la colección
      const rawDocs = await collection.find({}).limit(5).toArray();
      console.log('[API Clientes] Documentos raw encontrados (primeros 5):', rawDocs.length);
      if (rawDocs.length > 0) {
        console.log('[API Clientes] Ejemplo de documento raw:', JSON.stringify(rawDocs[0], null, 2));
      }
    }
    
    // Optimización para servidor VPS local: queries más rápidas con índices
    // El índice en createdAt hace el sort más rápido
    clientes = await Client.find({})
      .select('crmId nombre rubro ciudad email montoPago fechaPago pagado pagoUnico pagoMesSiguiente servicios observaciones createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean() // Usar lean() para obtener objetos planos (más rápido, sin overhead de Mongoose)
      .maxTimeMS(30000); // Timeout aumentado a 30 segundos para servidor VPS
    
    console.log('[API Clientes] Documentos encontrados con modelo:', clientes.length);
    
    // Si no se encontraron documentos pero hay en la colección, intentar sin filtros
    if (clientes.length === 0 && directCount > 0) {
      console.log('[API Clientes] Intentando consulta sin select ni sort...');
      const clientesSinFiltros = await Client.find({}).lean().maxTimeMS(30000);
      console.log('[API Clientes] Documentos sin filtros:', clientesSinFiltros.length);
      if (clientesSinFiltros.length > 0) {
        // Mapear manualmente los campos necesarios
        clientes = clientesSinFiltros.map(c => ({
          crmId: c.crmId,
          nombre: c.nombre,
          rubro: c.rubro,
          ciudad: c.ciudad,
          email: c.email,
          montoPago: c.montoPago,
          fechaPago: c.fechaPago,
          pagado: c.pagado,
          pagoUnico: c.pagoUnico,
          pagoMesSiguiente: c.pagoMesSiguiente,
          servicios: c.servicios,
          observaciones: c.observaciones,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        }));
        console.log('[API Clientes] Documentos mapeados manualmente:', clientes.length);
      }
    }
    
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

