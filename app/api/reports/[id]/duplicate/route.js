import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/mongo';
import Report from '../../../../../models/Report';
import { getCurrentUserId } from '../../../../../lib/auth';
import { calculateReportTotals } from '../../../../../lib/reportCalculations';

// POST /api/reports/[id]/duplicate - Duplicar informe
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
    
    // Buscar informe original por _id o reportId
    let originalReport = null;
    
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
    if (isValidObjectId) {
      try {
        originalReport = await Report.findById(params.id).lean();
      } catch (idError) {
        // Continuar para buscar por reportId
      }
    }
    
    if (!originalReport) {
      originalReport = await Report.findOne({ reportId: params.id }).lean();
    }
    
    if (!originalReport) {
      return NextResponse.json(
        { success: false, error: 'Informe no encontrado' },
        { status: 404 }
      );
    }
    
    // Generar nuevo reportId
    const newReportId = `report-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    // Crear copia del informe (sin _id, reportId, timestamps, share token)
    const reportData = {
      reportId: newReportId,
      clienteNombre: originalReport.clienteNombre,
      clienteEmail: originalReport.clienteEmail,
      titulo: `${originalReport.titulo} (Copia)`,
      periodo: {
        from: originalReport.periodo.from,
        to: originalReport.periodo.to
      },
      moneda: originalReport.moneda || 'ARS',
      estado: 'borrador', // Siempre como borrador
      createdBy: userId,
      sections: JSON.parse(JSON.stringify(originalReport.sections || [])), // Deep copy
      reportNotes: originalReport.reportNotes || {},
      share: {
        enabled: false
      }
    };
    
    const newReport = await Report.create(reportData, {
      runValidators: true,
      maxTimeMS: 30000
    });
    
    // Calcular totales
    const totals = calculateReportTotals(newReport.toObject());
    
    return NextResponse.json({
      success: true,
      data: {
        ...newReport.toObject(),
        computed: totals
      }
    }, { status: 201 });
  } catch (error) {
    console.error('[API Reports POST /[id]/duplicate] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

