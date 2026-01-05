import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/mongo';
import Report from '../../../../../models/Report';
import { getCurrentUserId } from '../../../../../lib/auth';
import crypto from 'crypto';

// POST /api/reports/[id]/share - Habilitar/deshabilitar compartir informe
export async function POST(request, { params }) {
  try {
    await connectDB();
    const userId = await getCurrentUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const enabled = body.enabled === true;
    
    // Buscar informe por _id o reportId
    let report = null;
    
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
    if (isValidObjectId) {
      try {
        report = await Report.findById(params.id);
      } catch (idError) {
        // Continuar para buscar por reportId
      }
    }
    
    if (!report) {
      report = await Report.findOne({ reportId: params.id });
    }
    
    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Informe no encontrado' },
        { status: 404 }
      );
    }
    
    // Verificar que el usuario es el creador
    if (report.createdBy !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para compartir este informe' },
        { status: 403 }
      );
    }
    
    const updateData = {
      'share.enabled': enabled
    };
    
    if (enabled) {
      // Generar token único si no existe o está deshabilitado
      if (!report.share?.token) {
        // Generar token seguro (32 bytes en hex = 64 caracteres)
        const token = crypto.randomBytes(32).toString('hex');
        updateData['share.token'] = token;
      }
      
      // Opcional: establecer fecha de expiración (30 días por defecto)
      if (!report.share?.expiresAt) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        updateData['share.expiresAt'] = expiresAt;
      }
    } else {
      // Al deshabilitar, no eliminar el token (para mantener historial)
      // Solo cambiar enabled a false
    }
    
    const reportUpdated = await Report.findByIdAndUpdate(
      report._id,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
        maxTimeMS: 30000,
        lean: true
      }
    );
    
    if (!reportUpdated) {
      return NextResponse.json(
        { success: false, error: 'Error al actualizar informe' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: reportUpdated
    });
  } catch (error) {
    console.error('[API Reports POST /[id]/share] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

