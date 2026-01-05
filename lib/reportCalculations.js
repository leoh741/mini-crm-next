// Helpers para calcular totales de informes

/**
 * Calcula los totales de un informe
 * @param {Object} report - El informe con sections e items
 * @returns {Object} - Objeto con totales por plataforma y globales
 */
export function calculateReportTotals(report) {
  if (!report || !report.sections || !Array.isArray(report.sections)) {
    return {
      totalsByPlatform: {},
      totalsGlobal: {}
    };
  }

  // Métricas calculadas que no se suman (son derivadas)
  const calculatedMetrics = ['ctr', 'cpc', 'cpa', 'costPerConversation', 'cpm'];
  
  const totalsByPlatform = {};
  const totalsGlobal = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversations: 0,
    conversions: 0,
    reach: 0,
    frequency: 0,
    frequencyCount: 0 // Para calcular promedio ponderado
  };

  // Iterar sobre cada sección (plataforma)
  report.sections.forEach(section => {
    if (!section.items || !Array.isArray(section.items)) return;
    
    const platform = section.platform || 'otro';
    const platformTotals = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversations: 0,
      conversions: 0,
      reach: 0,
      frequency: 0,
      frequencyCount: 0
    };

    // Iterar sobre cada item (campaña) de la sección
    section.items.forEach(item => {
      if (!item.metrics) return;
      
      const metrics = item.metrics instanceof Map 
        ? Object.fromEntries(item.metrics) 
        : item.metrics;

      // Procesar todas las métricas (predefinidas y personalizadas)
      Object.keys(metrics).forEach(key => {
        // Saltar métricas calculadas (derivadas)
        if (calculatedMetrics.includes(key)) return;
        
        // Frequency se maneja por separado (promedio ponderado)
        if (key === 'frequency') {
          if (metrics.frequency !== undefined && !isNaN(metrics.frequency) && 
              metrics.reach !== undefined && !isNaN(metrics.reach) && metrics.reach > 0) {
            const frequency = Number(metrics.frequency);
            const reach = Number(metrics.reach);
            platformTotals.frequency += frequency * reach;
            platformTotals.frequencyCount += reach;
            totalsGlobal.frequency += frequency * reach;
            totalsGlobal.frequencyCount += reach;
          }
          return;
        }
        
        const value = Number(metrics[key]);
        if (!isNaN(value)) {
          // Inicializar si no existe (para métricas personalizadas)
          if (platformTotals[key] === undefined) {
            platformTotals[key] = 0;
          }
          if (totalsGlobal[key] === undefined) {
            totalsGlobal[key] = 0;
          }
          
          // Sumar métricas numéricas
          platformTotals[key] += value;
          totalsGlobal[key] += value;
        }
      });
    });

    // Calcular métricas derivadas para la plataforma
    platformTotals.ctr = calculateCTR(platformTotals.clicks, platformTotals.impressions);
    platformTotals.cpc = calculateCPC(platformTotals.spend, platformTotals.clicks);
    platformTotals.cpa = calculateCPA(platformTotals.spend, platformTotals.conversions);
    platformTotals.costPerConversation = calculateCostPerConversation(
      platformTotals.spend, 
      platformTotals.conversations
    );
    platformTotals.cpm = calculateCPM(platformTotals.spend, platformTotals.impressions);
    
    // Frequency promedio ponderado
    if (platformTotals.frequencyCount > 0) {
      platformTotals.frequency = platformTotals.frequency / platformTotals.frequencyCount;
    } else {
      platformTotals.frequency = 0;
    }

    totalsByPlatform[platform] = platformTotals;
  });

  // Calcular métricas derivadas globales
  totalsGlobal.ctr = calculateCTR(totalsGlobal.clicks, totalsGlobal.impressions);
  totalsGlobal.cpc = calculateCPC(totalsGlobal.spend, totalsGlobal.clicks);
  totalsGlobal.cpa = calculateCPA(totalsGlobal.spend, totalsGlobal.conversions);
  totalsGlobal.costPerConversation = calculateCostPerConversation(
    totalsGlobal.spend, 
    totalsGlobal.conversations
  );
  totalsGlobal.cpm = calculateCPM(totalsGlobal.spend, totalsGlobal.impressions);
  
  // Frequency promedio ponderado global
  if (totalsGlobal.frequencyCount > 0) {
    totalsGlobal.frequency = totalsGlobal.frequency / totalsGlobal.frequencyCount;
  } else {
    totalsGlobal.frequency = 0;
  }

  // Limpiar frequencyCount del resultado final
  delete totalsGlobal.frequencyCount;
  Object.keys(totalsByPlatform).forEach(platform => {
    if (totalsByPlatform[platform].frequencyCount !== undefined) {
      delete totalsByPlatform[platform].frequencyCount;
    }
  });

  // Aplicar porcentaje de impuestos al spend total si existe
  if (report.porcentajeImpuestos && report.porcentajeImpuestos > 0) {
    const porcentaje = Number(report.porcentajeImpuestos);
    if (!isNaN(porcentaje) && totalsGlobal.spend > 0) {
      totalsGlobal.spendConImpuestos = totalsGlobal.spend * (1 + porcentaje / 100);
    }
  } else {
    totalsGlobal.spendConImpuestos = totalsGlobal.spend;
  }

  return {
    totalsByPlatform,
    totalsGlobal
  };
}

/**
 * Calcula CTR (Click-Through Rate) en porcentaje
 * @param {number} clicks - Total de clics
 * @param {number} impressions - Total de impresiones
 * @returns {number} - CTR en porcentaje (0-100)
 */
function calculateCTR(clicks, impressions) {
  if (!impressions || impressions === 0 || isNaN(clicks) || isNaN(impressions)) {
    return 0;
  }
  return (Number(clicks) / Number(impressions)) * 100;
}

/**
 * Calcula CPC (Cost Per Click)
 * @param {number} spend - Total gastado
 * @param {number} clicks - Total de clics
 * @returns {number} - CPC
 */
function calculateCPC(spend, clicks) {
  if (!clicks || clicks === 0 || isNaN(spend) || isNaN(clicks)) {
    return 0;
  }
  return Number(spend) / Number(clicks);
}

/**
 * Calcula CPA (Cost Per Acquisition)
 * @param {number} spend - Total gastado
 * @param {number} conversions - Total de conversiones
 * @returns {number} - CPA
 */
function calculateCPA(spend, conversions) {
  if (!conversions || conversions === 0 || isNaN(spend) || isNaN(conversions)) {
    return 0;
  }
  return Number(spend) / Number(conversions);
}

/**
 * Calcula Cost Per Conversation
 * @param {number} spend - Total gastado
 * @param {number} conversations - Total de conversaciones
 * @returns {number} - Cost per conversation
 */
function calculateCostPerConversation(spend, conversations) {
  if (!conversations || conversations === 0 || isNaN(spend) || isNaN(conversations)) {
    return 0;
  }
  return Number(spend) / Number(conversations);
}

/**
 * Calcula CPM (Cost Per Mille - por 1000 impresiones)
 * @param {number} spend - Total gastado
 * @param {number} impressions - Total de impresiones
 * @returns {number} - CPM
 */
function calculateCPM(spend, impressions) {
  if (!impressions || impressions === 0 || isNaN(spend) || isNaN(impressions)) {
    return 0;
  }
  return (Number(spend) / Number(impressions)) * 1000;
}

/**
 * Formatea un número con separadores de miles y decimales
 * @param {number} value - Valor a formatear
 * @param {number} decimals - Número de decimales (default: 2)
 * @returns {string} - Valor formateado
 */
export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  
  const num = Number(value);
  if (num === 0) return '0';
  
  return num.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Formatea un porcentaje
 * @param {number} value - Valor a formatear (0-100)
 * @param {number} decimals - Número de decimales (default: 2)
 * @returns {string} - Porcentaje formateado
 */
export function formatPercentage(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }
  
  const num = Number(value);
  return `${num.toFixed(decimals)}%`;
}

