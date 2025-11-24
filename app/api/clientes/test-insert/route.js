import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';

export async function GET() {
  try {
    console.log('[TEST INSERT] Iniciando prueba de inserción...');
    await connectDB();
    console.log('[TEST INSERT] Conectado a MongoDB');

    const cliente = await Client.create({
      crmId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      nombre: 'TEST CLIENT',
      email: 'test@example.com',
      rubro: 'Test',
      ciudad: 'Test City'
    });

    console.log('[TEST INSERT] Cliente creado con _id:', cliente._id);
    console.log('[TEST INSERT] Cliente creado con crmId:', cliente.crmId);

    return NextResponse.json({ 
      ok: true, 
      id: cliente._id.toString(),
      crmId: cliente.crmId,
      message: 'Cliente de prueba creado correctamente'
    });
  } catch (error) {
    console.error('[TEST INSERT] Error:', error);
    console.error('[TEST INSERT] Stack:', error.stack);
    return NextResponse.json({ 
      ok: false, 
      error: String(error),
      message: error.message 
    }, { status: 500 });
  }
}

