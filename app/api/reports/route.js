import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Report from '../../../models/Report';
import { getCurrentUserId } from '../../../lib/auth';
import { calculateReportTotals } from '../../../lib/reportCalculations';

// GET /api/reports - Listar informes con filtros opcionales
export async function GET(request) {
  try {
    await connectDB();
    const userId = await getCurrentUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clienteNombre = searchParams.get('clienteNombre');
    const estado = searchParams.get('estado');
    const plataforma = searchParams.get('plataforma');
    const fechaDesde = searchParams.get('fechaDesde');
    const fechaHasta = searchParams.get('fechaHasta');

    // Construir query de filtrado
    const query = { createdBy: userId };

    if (clienteNombre) {
      query.clienteNombre = { $regex: clienteNombre, $options: 'i' };
    }

    if (estado) {
      query.estado = estado;
    }

    if (fechaDesde || fechaHasta) {
      query['periodo.from'] = {};
      if (fechaDesde) {
        query['periodo.from'].$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        query['periodo.to'] = { $lte: new Date(fechaHasta) };
      }
    }

    // Filtrar por plataforma (buscar en sections)
    if (plataforma) {
      query['sections.platform'] = plataforma;
    }

    const reports = await Report.find(query)
      .select('-sections.items.metrics') // No incluir métricas detalladas en el listado
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(30000);

    // Calcular totales básicos para cada informe (solo spend total para el listado)
    const reportsWithTotals = reports.map(report => {
      const totals = calculateReportTotals(report);
      return {
        ...report,
        computed: {
          totalsGlobal: {
            spend: totals.totalsGlobal.spend || 0
          }
        }
      };
    });

    return NextResponse.json({ success: true, data: reportsWithTotals });
  } catch (error) {
    console.error('[API Reports GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/reports - Crear nuevo informe
export async function POST(request) {
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

    // Validaciones básicas
    if (!body.clienteNombre || !body.clienteNombre.trim()) {
      return NextResponse.json(
        { success: false, error: 'clienteNombre es requerido' },
        { status: 400 }
      );
    }

    if (!body.titulo || !body.titulo.trim()) {
      return NextResponse.json(
        { success: false, error: 'titulo es requerido' },
        { status: 400 }
      );
    }

    if (!body.periodo || !body.periodo.from || !body.periodo.to) {
      return NextResponse.json(
        { success: false, error: 'periodo.from y periodo.to son requeridos' },
        { status: 400 }
      );
    }

    // Validar fechas
    const fechaFrom = new Date(body.periodo.from);
    const fechaTo = new Date(body.periodo.to);
    
    if (isNaN(fechaFrom.getTime()) || isNaN(fechaTo.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Fechas inválidas' },
        { status: 400 }
      );
    }

    if (fechaFrom > fechaTo) {
      return NextResponse.json(
        { success: false, error: 'periodo.from debe ser anterior a periodo.to' },
        { status: 400 }
      );
    }

    // Generar reportId único
    const reportId = `report-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Validar que userId esté presente
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      console.error('[API Reports POST] userId inválido:', userId);
      return NextResponse.json(
        { success: false, error: 'Error de autenticación: usuario no identificado' },
        { status: 401 }
      );
    }

    // Asegurar que las fechas sean objetos Date válidos
    if (!(fechaFrom instanceof Date) || !(fechaTo instanceof Date) || 
        isNaN(fechaFrom.getTime()) || isNaN(fechaTo.getTime())) {
      console.error('[API Reports POST] Fechas inválidas:', { fechaFrom, fechaTo });
      return NextResponse.json(
        { success: false, error: 'Fechas inválidas' },
        { status: 400 }
      );
    }

    // Preparar datos del informe
    const reportData = {
      reportId,
      clienteNombre: body.clienteNombre.trim(),
      clienteEmail: body.clienteEmail ? body.clienteEmail.trim() : undefined,
      titulo: body.titulo.trim(),
      periodo: {
        from: fechaFrom,
        to: fechaTo
      },
      moneda: body.moneda || 'ARS',
      porcentajeImpuestos: body.porcentajeImpuestos ? Number(body.porcentajeImpuestos) : 0,
      estado: body.estado || 'borrador',
      createdBy: userId.trim(),
      sections: body.sections || [],
      reportNotes: body.reportNotes || {},
      share: {
        enabled: false
      }
    };

    // Validación final antes de crear
    if (!reportData.titulo || reportData.titulo.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'titulo es requerido' },
        { status: 400 }
      );
    }

    if (!reportData.createdBy || reportData.createdBy.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Error de autenticación: usuario no identificado' },
        { status: 401 }
      );
    }

    if (!reportData.periodo || !reportData.periodo.from || !reportData.periodo.to) {
      return NextResponse.json(
        { success: false, error: 'periodo.from y periodo.to son requeridos' },
        { status: 400 }
      );
    }

    console.log('[API Reports POST] Datos a crear:', {
      reportId: reportData.reportId,
      titulo: reportData.titulo,
      createdBy: reportData.createdBy,
      periodo: {
        from: reportData.periodo.from,
        to: reportData.periodo.to
      },
      clienteNombre: reportData.clienteNombre
    });

    // Validar y normalizar sections
    if (Array.isArray(reportData.sections)) {
      reportData.sections = reportData.sections.map(section => {
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

            // Normalizar metrics (convertir Map a objeto si es necesario)
            if (item.metrics) {
              if (item.metrics instanceof Map) {
                normalizedItem.metrics = Object.fromEntries(item.metrics);
              } else if (typeof item.metrics === 'object') {
                // Convertir todos los valores a números válidos
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

    const report = await Report.create(reportData, {
      runValidators: true,
      maxTimeMS: 30000
    });

    // Calcular totales
    const totals = calculateReportTotals(report.toObject());

    return NextResponse.json({
      success: true,
      data: {
        ...report.toObject(),
        computed: totals
      }
    }, { status: 201 });
  } catch (error) {
    console.error('[API Reports POST] Error:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors || {}).map(key => {
        return `${key}: ${error.errors[key].message}`;
      }).join(', ');
      
      return NextResponse.json(
        { 
          success: false, 
          error: `Report validation failed: ${validationErrors}` 
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message || 'Error al crear el informe' },
      { status: 400 }
    );
  }
}

