"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getReportById, deleteReport, duplicateReport } from "../../../lib/reportsUtils";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";
import TotalsPanel from "../../../components/reports/TotalsPanel";
import SharePanel from "../../../components/reports/SharePanel";
import { formatNumber, formatPercentage } from "../../../lib/reportCalculations";
import { generarInformePDF } from "../../../lib/pdfGenerator";

function InformeDetallePageContent() {
  const params = useParams();
  const router = useRouter();
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("resumen");
  const [deleting, setDeleting] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  useEffect(() => {
    const cargarInforme = async () => {
      try {
        setLoading(true);
        setError("");
        const id = params.id;
        const datos = await getReportById(id, false);
        if (datos) {
          setInforme(datos);
        } else {
          setError("Informe no encontrado");
        }
      } catch (err) {
        console.error('Error al cargar informe:', err);
        setError(err.message || "Error al cargar el informe");
      } finally {
        setLoading(false);
      }
    };
    if (params.id) {
      cargarInforme();
    }
  }, [params.id]);

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar este informe? Esta acción no se puede deshacer.")) {
      return;
    }

    try {
      setDeleting(true);
      await deleteReport(informe._id || informe.reportId);
      router.push("/informes");
    } catch (err) {
      console.error('Error al eliminar:', err);
      alert("Error al eliminar el informe: " + err.message);
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      // Redirigir inmediatamente al hacer click, sin esperar la respuesta
      router.push('/informes');
      
      // Duplicar el informe en segundo plano (sin await para no bloquear la redirección)
      duplicateReport(informe._id || informe.reportId).catch(err => {
        console.error('Error al duplicar informe en segundo plano:', err);
      });
    } catch (err) {
      console.error('Error al duplicar:', err);
      alert("Error al duplicar el informe: " + err.message);
    }
  };

  const handleShareUpdate = (updatedInforme) => {
    setInforme(updatedInforme);
  };

  const handleDownloadPDF = async () => {
    if (!informe) return;
    try {
      setDownloadingPDF(true);
      // Generación programática (igual en móvil y escritorio), como resúmenes de pago
      await generarInformePDF(informe, informe.computed);
    } catch (err) {
      console.error('Error al descargar PDF:', err);
      const errorMessage = err?.message || err?.toString() || 'Error desconocido';
      alert("Error al descargar el PDF: " + errorMessage);
    } finally {
      setDownloadingPDF(false);
    }
  };

  // Helper para obtener userId de la sesión
  function getUserIdFromSession() {
    if (typeof window === 'undefined') return '';
    try {
      const session = localStorage.getItem('crm_session');
      if (!session) return '';
      const sessionData = JSON.parse(session);
      return sessionData.usuarioId || '';
    } catch (error) {
      console.error('Error al obtener userId de sesión:', error);
      return '';
    }
  }

  const formatearMoneda = (monto, moneda = 'ARS') => {
    if (monto === null || monto === undefined || isNaN(monto)) return '-';
    // Formatear moneda sin decimales innecesarios (solo mostrar si existen)
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(monto);
  };

  // Formatear número sin decimales innecesarios
  const formatNumberSmart = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    const num = Number(value);
    // Si es un número entero, no mostrar decimales
    const isInteger = num % 1 === 0;
    if (isInteger) {
      return num.toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
    // Para números con decimales, mostrar solo los decimales necesarios (hasta 2)
    return num.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  // Determinar si una métrica es de tipo moneda
  const isCurrencyMetric = (key) => {
    const currencyMetrics = ['spend', 'cpc', 'cpa', 'costPerConversation', 'cpm'];
    const currencyKeywords = ['costo', 'cost', 'precio', 'price', 'gasto', 'spend', 'revenue', 'ingreso'];
    return currencyMetrics.includes(key) || 
           currencyKeywords.some(keyword => key.toLowerCase().includes(keyword));
  };

  // Determinar si una métrica es de tipo porcentaje
  const isPercentageMetric = (key) => {
    return key === 'ctr' || key.toLowerCase().includes('porcentaje') || key.toLowerCase().includes('percentage');
  };

  // Obtener label formateado para una métrica
  const getMetricLabel = (key) => {
    const labels = {
      spend: 'Importe gastado',
      impressions: 'Impresiones',
      clicks: 'Clicks',
      ctr: 'CTR',
      conversations: 'Conversaciones',
      conversions: 'Conversiones',
      cpc: 'CPC',
      cpa: 'CPA',
      costPerConversation: 'Costo por Conversación',
      cpm: 'CPM',
      reach: 'Alcance',
      frequency: 'Frecuencia'
    };
    return labels[key] || key;
  };

  // Formatear valor de métrica según su tipo
  const formatMetricValue = (key, value) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    if (isPercentageMetric(key)) {
      const num = Number(value);
      const isInteger = num % 1 === 0;
      return `${num.toFixed(isInteger ? 0 : 2)}%`;
    }
    if (isCurrencyMetric(key)) {
      return formatearMoneda(value, informe.moneda);
    }
    return formatNumberSmart(value);
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatearPeriodo = (periodo) => {
    if (!periodo || !periodo.from || !periodo.to) return '-';
    return `${formatearFecha(periodo.from)} - ${formatearFecha(periodo.to)}`;
  };

  const getPlataformaNombre = (platform) => {
    const nombres = {
      meta: 'Meta Ads',
      google: 'Google Ads',
      otro: 'Otro'
    };
    return nombres[platform] || platform;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-300">Cargando informe...</div>
      </div>
    );
  }

  if (error || !informe) {
    return (
      <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
        <p className="text-red-400">{error || "Informe no encontrado"}</p>
        <Link href="/informes" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
          ← Volver a Informes
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: "resumen", label: "Resumen" },
    { id: "secciones", label: "Secciones" },
    { id: "notas", label: "Notas" },
    { id: "compartir", label: "Compartir" }
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="min-w-0">
          <Link href="/informes" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
            ← Volver a Informes
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1 break-words">{informe.titulo}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
            <span className="flex items-center gap-1 min-w-0">
              <Icons.User className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{informe.clienteNombre}</span>
              {informe.clienteEmail && <span className="text-slate-500 hidden sm:inline">• {informe.clienteEmail}</span>}
            </span>
            <span className="flex items-center gap-1">
              <Icons.Calendar className="w-4 h-4 flex-shrink-0" />
              {formatearPeriodo(informe.periodo)}
            </span>
            <span className={`px-2 py-1 rounded text-xs border ${
              informe.estado === 'publicado' 
                ? 'bg-green-900/30 text-green-400 border-green-700'
                : 'bg-gray-900/30 text-gray-400 border-gray-700'
            }`}>
              {informe.estado === 'publicado' ? 'Publicado' : 'Borrador'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full">
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF || loading}
            className="px-3 py-2.5 sm:px-4 sm:py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs sm:text-sm font-medium text-white flex items-center justify-center gap-1.5 sm:gap-2"
          >
            {downloadingPDF ? (
              <>
                <Icons.Refresh className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>Generando...</span>
              </>
            ) : (
              <>
                <Icons.Download className="w-4 h-4 flex-shrink-0" />
                <span>Descargar PDF</span>
              </>
            )}
          </button>
          <Link
            href={`/informes/${informe._id || informe.reportId}/editar`}
            className="px-3 py-2.5 sm:px-4 sm:py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs sm:text-sm font-medium text-white flex items-center justify-center gap-1.5 sm:gap-2"
          >
            <Icons.Pencil className="w-4 h-4 flex-shrink-0" />
            <span>Editar</span>
          </Link>
          <button
            onClick={handleDuplicate}
            className="px-3 py-2.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs sm:text-sm font-medium text-white flex items-center justify-center gap-1.5 sm:gap-2"
          >
            <Icons.Duplicate className="w-4 h-4 flex-shrink-0" />
            <span>Duplicar</span>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-2.5 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs sm:text-sm font-medium text-white flex items-center justify-center gap-1.5 sm:gap-2"
          >
            <Icons.Trash className="w-4 h-4 flex-shrink-0" />
            <span>{deleting ? 'Eliminando...' : 'Eliminar'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700 mb-6 -mx-3 px-3 md:mx-0 md:px-0 overflow-x-auto">
        <div className="flex gap-1 sm:gap-2 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 sm:px-4 py-2 border-b-2 transition-colors whitespace-nowrap text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "resumen" && (
        <div className="space-y-6 pb-4">
          {/* Importe gastado total */}
          {informe.computed?.totalsGlobal?.spend && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Importe gastado total</div>
                <div className="text-2xl font-semibold text-slate-100">
                {formatearMoneda(
                  informe.computed.totalsGlobal.spendConImpuestos || informe.computed.totalsGlobal.spend, 
                  informe.moneda
                )}
              </div>
              {informe.porcentajeImpuestos > 0 && (
                <div className="text-xs text-slate-500 mt-1">
                  (Base: {formatearMoneda(informe.computed.totalsGlobal.spend, informe.moneda)} + {informe.porcentajeImpuestos}% impuestos)
                </div>
              )}
            </div>
          )}

          {/* Totales por Plataforma */}
          {informe.computed && (
            <TotalsPanel totals={informe.computed} moneda={informe.moneda} />
          )}

          {/* Secciones con métricas detalladas */}
          {informe.sections && informe.sections.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-100">Campañas</h3>
              {informe.sections.map((section, sIdx) => (
                <div key={sIdx} className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h4 className="text-md font-semibold text-slate-200 mb-2">
                    {getPlataformaNombre(section.platform)}
                    {section.name && <span className="text-slate-400 ml-2">- {section.name}</span>}
                  </h4>
                  {section.items && section.items.length > 0 ? (
                    <div className="space-y-4 mt-4">
                      {section.items.map((item, iIdx) => (
                        <div key={iIdx} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                          <h5 className="font-medium text-slate-200 mb-2">{item.campaignName}</h5>
                          {item.objective && (
                            <p className="text-sm text-slate-400 mb-3">Objetivo: {item.objective}</p>
                          )}
                          {item.metrics && Object.keys(item.metrics).length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {Object.entries(item.metrics)
                                .sort(([keyA], [keyB]) => {
                                  // Mover 'spend' al final
                                  if (keyA === 'spend') return 1;
                                  if (keyB === 'spend') return -1;
                                  return 0;
                                })
                                .map(([key, value]) => (
                                <div key={key}>
                                  <div className="text-xs text-slate-400">{getMetricLabel(key)}</div>
                                  <div className="text-sm font-medium text-slate-200">
                                    {typeof value === 'number' ? formatMetricValue(key, value) : value}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {item.notes && (
                            <div className="mt-3 pt-3 border-t border-slate-700">
                              <div className="text-xs text-slate-400 mb-1">Notas</div>
                              <div className="text-sm text-slate-300">{item.notes}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">No hay campañas en esta sección</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "secciones" && (
        <div className="space-y-4">
          {informe.sections && informe.sections.length > 0 ? (
            informe.sections.map((section, sIdx) => (
              <div key={sIdx} className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-slate-100 mb-2">
                  {getPlataformaNombre(section.platform)}
                  {section.name && <span className="text-slate-400 ml-2">- {section.name}</span>}
                </h3>
                {section.items && section.items.length > 0 ? (
                  <div className="space-y-4 mt-4">
                    {section.items.map((item, iIdx) => (
                      <div key={iIdx} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                        <h4 className="font-medium text-slate-200 mb-2">{item.campaignName}</h4>
                        {item.objective && (
                          <p className="text-sm text-slate-400 mb-3">Objetivo: {item.objective}</p>
                        )}
                        {item.metrics && Object.keys(item.metrics).length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(item.metrics)
                              .sort(([keyA], [keyB]) => {
                                // Mover 'spend' al final
                                if (keyA === 'spend') return 1;
                                if (keyB === 'spend') return -1;
                                return 0;
                              })
                              .map(([key, value]) => (
                              <div key={key}>
                                <div className="text-xs text-slate-400">{getMetricLabel(key)}</div>
                                <div className="text-sm font-medium text-slate-200">
                                  {typeof value === 'number' ? formatMetricValue(key, value) : value}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {item.notes && (
                          <div className="mt-3 pt-3 border-t border-slate-700">
                            <div className="text-xs text-slate-400 mb-1">Notas</div>
                            <div className="text-sm text-slate-300">{item.notes}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">No hay campañas en esta sección</p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-slate-400">
              No hay secciones en este informe
            </div>
          )}
        </div>
      )}

      {activeTab === "notas" && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100 mb-3">Observaciones</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 text-slate-300 whitespace-pre-wrap">
              {informe.reportNotes?.observaciones || "No hay observaciones"}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100 mb-3">Recomendaciones</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 text-slate-300 whitespace-pre-wrap">
              {informe.reportNotes?.recomendaciones || "No hay recomendaciones"}
            </div>
          </div>
        </div>
      )}

      {activeTab === "compartir" && (
        <SharePanel informe={informe} onUpdate={handleShareUpdate} />
      )}
    </div>
  );
}

export default function InformeDetallePage() {
  return (
    <ProtectedRoute>
      <InformeDetallePageContent />
    </ProtectedRoute>
  );
}

