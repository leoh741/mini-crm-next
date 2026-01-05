"use client";

import { Icons } from "../Icons";
import { formatNumber, formatPercentage } from "../../lib/reportCalculations";

/**
 * Componente para mostrar los totales de un informe
 * @param {Object} totals - Totales calculados (totalsByPlatform, totalsGlobal)
 * @param {string} moneda - Moneda del informe (ARS, USD, EUR)
 */
export default function TotalsPanel({ totals, moneda = 'ARS' }) {
  if (!totals || !totals.totalsGlobal) {
    return null;
  }

  const { totalsByPlatform = {}, totalsGlobal = {} } = totals;

  const formatearMoneda = (monto) => {
    if (monto === null || monto === undefined || isNaN(monto)) return '-';
    // Formatear moneda sin decimales innecesarios (solo mostrar si existen)
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(monto);
  };

  const getPlataformaNombre = (platform) => {
    const nombres = {
      meta: 'Meta Ads',
      google: 'Google Ads',
      otro: 'Otro'
    };
    return nombres[platform] || platform;
  };

  // Determinar si una métrica es de tipo moneda (calculadas o palabras clave)
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

  // Formatear porcentaje sin decimales innecesarios
  const formatPercentageSmart = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    const num = Number(value);
    // Si es un número entero, no mostrar decimales
    const isInteger = num % 1 === 0;
    if (isInteger) {
      return `${num.toFixed(0)}%`;
    }
    // Para números con decimales, mostrar solo los decimales necesarios (hasta 2)
    return `${num.toFixed(2)}%`;
  };

  // Formatear valor según tipo de métrica
  const formatMetricValue = (key, value) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    if (isPercentageMetric(key)) {
      return formatPercentageSmart(value);
    }
    if (isCurrencyMetric(key)) {
      return formatearMoneda(value);
    }
    // Por defecto, números sin decimales innecesarios
    return formatNumberSmart(value);
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

  // Filtrar métricas que tienen valores reales (no 0, null, undefined)
  const getMetricsWithValues = (metrics) => {
    return Object.keys(metrics).filter(key => {
      // Excluir frequencyCount (es un campo interno)
      if (key === 'frequencyCount') return false;
      
      const value = metrics[key];
      // Solo mostrar métricas con valores reales (no null, undefined, NaN, ni 0)
      // Esto incluye todas las métricas (predefinidas y personalizadas)
      return value !== null && value !== undefined && !isNaN(value) && value !== 0;
    });
  };

  return (
    <div className="space-y-6">
      {/* Totales por Plataforma */}
      {Object.keys(totalsByPlatform).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-100">Totales por Plataforma</h3>
          {Object.entries(totalsByPlatform).map(([platform, platformTotals]) => {
            const platformMetricsKeys = getMetricsWithValues(platformTotals);
            // Ordenar para que 'spend' aparezca al final
            const sortedKeys = platformMetricsKeys.sort((a, b) => {
              if (a === 'spend') return 1;
              if (b === 'spend') return -1;
              return 0;
            });
            return (
              <div key={platform} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h4 className="text-md font-semibold text-slate-200 mb-3">
                  {getPlataformaNombre(platform)}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {sortedKeys.map(key => (
                    <div key={key} className="bg-slate-900/50 rounded p-3">
                      <div className="text-xs text-slate-400 mb-1">{getMetricLabel(key)}</div>
                      <div className="text-md font-semibold text-slate-100">
                        {formatMetricValue(key, platformTotals[key])}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

