import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/mongo';
import Report from '../../../../../models/Report';
import { calculateReportTotals } from '../../../../../lib/reportCalculations';

// GET /api/reports/shared/[token] - Obtener informe compartido (público, sin auth)
export async function GET(request, { params }) {
  try {
    await connectDB();
    const token = params.token;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token requerido' },
        { status: 400 }
      );
    }
    
    // Buscar informe por token de compartir
    const report = await Report.findOne({
      'share.token': token,
      'share.enabled': true
    }).lean().maxTimeMS(30000);
    
    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Informe no encontrado o compartir deshabilitado' },
        { status: 404 }
      );
    }
    
    // Verificar si el token expiró
    if (report.share?.expiresAt) {
      const expiresAt = new Date(report.share.expiresAt);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { success: false, error: 'El enlace de compartir expiró' },
          { status: 410 } // 410 Gone
        );
      }
    }
    
    // Solo devolver si el informe está publicado
    if (report.estado !== 'publicado') {
      return NextResponse.json(
        { success: false, error: 'Informe no disponible' },
        { status: 404 }
      );
    }
    
    // Calcular totales
    const totals = calculateReportTotals(report);
    
    // Devolver informe (sin información sensible como createdBy)
    const { createdBy, ...publicReport } = report;
    
    return NextResponse.json({
      success: true,
      data: {
        ...publicReport,
        computed: totals
      }
    });
  } catch (error) {
    console.error('[API Reports GET /shared/[token]] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

