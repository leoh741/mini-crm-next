import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Report from '../../../../models/Report';
import { getCurrentUserId } from '../../../../lib/auth';
import { calculateReportTotals } from '../../../../lib/reportCalculations';

// GET /api/reports/[id] - Obtener informe por ID
export async function GET(request, { params }) {
  try {
    await connectDB();
    const searchId = params.id;
    
    let report = null;
    
    // Buscar por _id o por reportId
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchId);
    if (isValidObjectId) {
      try {
        report = await Report.findById(searchId).lean().maxTimeMS(30000);
      } catch (idError) {
        console.warn('Error al buscar por _id:', idError.message);
      }
    }
    
    if (!report) {
      report = await Report.findOne({ reportId: searchId }).lean().maxTimeMS(30000);
    }
    
    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Informe no encontrado' },
        { status: 404 }
      );
    }
    
    // Calcular totales
    const totals = calculateReportTotals(report);
    
    return NextResponse.json({
      success: true,
      data: {
        ...report,
        computed: totals
      }
    });
  } catch (error) {
    console.error('[API Reports GET /[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/reports/[id] - Actualizar informe
export async function PATCH(request, { params }) {
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
        { success: false, error: 'No autorizado para modificar este informe' },
        { status: 403 }
      );
    }
    
    // Preparar datos de actualización
    const updateData = {};
    
    if (body.clienteNombre !== undefined) updateData.clienteNombre = body.clienteNombre.trim();
    if (body.clienteEmail !== undefined) updateData.clienteEmail = body.clienteEmail ? body.clienteEmail.trim() : undefined;
    if (body.titulo !== undefined) updateData.titulo = body.titulo.trim();
    if (body.moneda !== undefined) updateData.moneda = body.moneda;
    if (body.porcentajeImpuestos !== undefined) updateData.porcentajeImpuestos = Number(body.porcentajeImpuestos) || 0;
    if (body.estado !== undefined) updateData.estado = body.estado;
    if (body.reportNotes !== undefined) updateData.reportNotes = body.reportNotes;
    
    // Actualizar periodo si se proporciona
    if (body.periodo) {
      if (body.periodo.from) {
        updateData['periodo.from'] = new Date(body.periodo.from);
      }
      if (body.periodo.to) {
        updateData['periodo.to'] = new Date(body.periodo.to);
      }
    }
    
    // Actualizar sections si se proporciona
    if (body.sections !== undefined && Array.isArray(body.sections)) {
      updateData.sections = body.sections.map(section => {
        const normalizedSection = {
          platform: section.platform || 'otro',
          name: section.name || '',
          items: []
        };
        
        if (Array.isArray(section.items)) {
          normalizedSection.items = section.items.map(item => {
            const normalizedItem = {
              campaignName: item.campaignName || '',
              objective: item.objective || '',
              template: item.template || 'custom',
              metrics: {},
              notes: item.notes || ''
            };
            
            // Normalizar metrics
            if (item.metrics) {
              if (item.metrics instanceof Map) {
                normalizedItem.metrics = Object.fromEntries(item.metrics);
              } else if (typeof item.metrics === 'object') {
                Object.keys(item.metrics).forEach(key => {
                  const value = Number(item.metrics[key]);
                  if (!isNaN(value)) {
                    normalizedItem.metrics[key] = value;
                  }
                });
              }
            }
            
            return normalizedItem;
          });
        }
        
        return normalizedSection;
      });
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
        { success: false, error: 'Informe no encontrado' },
        { status: 404 }
      );
    }
    
    // Calcular totales
    const totals = calculateReportTotals(reportUpdated);
    
    return NextResponse.json({
      success: true,
      data: {
        ...reportUpdated,
        computed: totals
      }
    });
  } catch (error) {
    console.error('[API Reports PATCH /[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

// DELETE /api/reports/[id] - Eliminar informe
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const userId = await getCurrentUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }
    
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
        { success: false, error: 'No autorizado para eliminar este informe' },
        { status: 403 }
      );
    }
    
    await Report.findByIdAndDelete(report._id, {
      maxTimeMS: 30000
    });
    
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error('[API Reports DELETE /[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

