"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getSharedReport } from "../../../../lib/reportsUtils";
import TotalsPanel from "../../../../components/reports/TotalsPanel";
import { Icons } from "../../../../components/Icons";
import { formatNumber, formatPercentage } from "../../../../lib/reportCalculations";

function InformeCompartidoPageContent() {
  const params = useParams();
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargarInforme = async () => {
      try {
        setLoading(true);
        setError("");
        const token = params.token;
        const datos = await getSharedReport(token);
        if (datos) {
          setInforme(datos);
        } else {
          setError("Informe no encontrado o enlace inválido");
        }
      } catch (err) {
        console.error('Error al cargar informe compartido:', err);
        setError(err.message || "Error al cargar el informe");
      } finally {
        setLoading(false);
      }
    };
    if (params.token) {
      cargarInforme();
    }
  }, [params.token]);

  const formatearMoneda = (monto, moneda = 'ARS') => {
    if (monto === null || monto === undefined || isNaN(monto)) return '-';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto);
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
      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
          <h1 className="text-xl font-semibold text-red-400 mb-2">Error</h1>
          <p className="text-red-300">{error || "Informe no encontrado"}</p>
          <p className="text-sm text-red-400 mt-4">
            El enlace puede haber expirado o el informe puede no estar disponible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-4">
          <p className="text-blue-300 text-sm flex items-center gap-2">
            <Icons.Share className="w-4 h-4" />
            Vista compartida
          </p>
        </div>
        <h1 className="text-2xl font-semibold mb-1">{informe.titulo}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
          <span className="flex items-center gap-1">
            <Icons.User className="w-4 h-4" />
            {informe.clienteNombre}
            {informe.clienteEmail && <span className="text-slate-500">• {informe.clienteEmail}</span>}
          </span>
          <span className="flex items-center gap-1">
            <Icons.Calendar className="w-4 h-4" />
            {formatearPeriodo(informe.periodo)}
          </span>
        </div>
      </div>

      {/* Resumen con KPIs */}
      {informe.computed?.totalsGlobal && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
          {informe.computed.totalsGlobal.impressions > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Impresiones</div>
              <div className="text-2xl font-semibold text-slate-100">
                {formatNumber(informe.computed.totalsGlobal.impressions, 0)}
              </div>
            </div>
          )}
          {informe.computed.totalsGlobal.clicks > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Clicks</div>
              <div className="text-2xl font-semibold text-slate-100">
                {formatNumber(informe.computed.totalsGlobal.clicks, 0)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Totales */}
      {informe.computed && (
        <div className="mb-6">
          <TotalsPanel totals={informe.computed} moneda={informe.moneda} />
        </div>
      )}

      {/* Secciones */}
      {informe.sections && informe.sections.length > 0 && (
        <div className="space-y-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-100">Secciones</h2>
          {informe.sections.map((section, sIdx) => (
            <div key={sIdx} className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                {getPlataformaNombre(section.platform)}
                {section.name && <span className="text-slate-400 ml-2">- {section.name}</span>}
              </h3>
              {section.items && section.items.length > 0 ? (
                <div className="space-y-4">
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
                            .map(([key, value]) => {
                              // Función para obtener el label de la métrica
                              const getMetricLabel = (key) => {
                                const labels = {
                                  spend: 'Importe gastado',
                                  impressions: 'Impresiones',
                                  clicks: 'Clicks',
                                  ctr: 'CTR',
                                  conversations: 'Conversaciones',
                                  conversions: 'Conversaciones',
                                  cpc: 'CPC',
                                  cpa: 'CPA',
                                  costPerConversation: 'Costo por Conversación',
                                  cpm: 'CPM',
                                  reach: 'Alcance',
                                  frequency: 'Frecuencia'
                                };
                                return labels[key] || key;
                              };
                              return (
                                <div key={key}>
                                  <div className="text-xs text-slate-400">{getMetricLabel(key)}</div>
                                  <div className="text-sm font-medium text-slate-200">
                                    {typeof value === 'number' ? formatNumber(value, 2) : value}
                                  </div>
                                </div>
                              );
                            })}
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

      {/* Notas */}
      {(informe.reportNotes?.observaciones || informe.reportNotes?.recomendaciones) && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-6">
          {informe.reportNotes.observaciones && (
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-3">Observaciones</h3>
              <div className="bg-slate-900/50 rounded-lg p-4 text-slate-300 whitespace-pre-wrap">
                {informe.reportNotes.observaciones}
              </div>
            </div>
          )}
          {informe.reportNotes.recomendaciones && (
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-3">Recomendaciones</h3>
              <div className="bg-slate-900/50 rounded-lg p-4 text-slate-300 whitespace-pre-wrap">
                {informe.reportNotes.recomendaciones}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InformeCompartidoPage() {
  return <InformeCompartidoPageContent />;
}

