import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/mongo';
import Report from '../../../../../models/Report';
import { getCurrentUserId } from '../../../../../lib/auth';
import { calculateReportTotals } from '../../../../../lib/reportCalculations';
import jsPDF from 'jspdf';
import { Buffer } from 'buffer';

// Función auxiliar para cargar logo desde URL (versión servidor)
async function cargarLogoBase64Server(url) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[PDF Server] Error al cargar logo:', error);
    return null;
  }
}

// Función auxiliar para cargar logo PNG local (versión servidor)
async function cargarLogoPNGServer(requestUrl) {
  try {
    // Intentar con diferentes variantes del nombre (case-sensitive en Linux)
    const posiblesNombres = ['/Logo.png', '/logo.png', '/LOGO.PNG'];
    
    // Construir URL base desde la request
    let baseUrl = '';
    try {
      const url = new URL(requestUrl || 'http://localhost:3000');
      baseUrl = `${url.protocol}//${url.host}`;
    } catch (e) {
      baseUrl = 'http://localhost:3000';
    }
    
    for (const nombreLogo of posiblesNombres) {
      try {
        const logoUrl = `${baseUrl}${nombreLogo}`;
        const logoBase64 = await cargarLogoBase64Server(logoUrl);
        if (logoBase64) {
          console.log(`[PDF Server] Logo PNG local cargado exitosamente desde ${logoUrl}`);
          return logoBase64;
        }
      } catch (localError) {
        continue;
      }
    }
    
    // Si no se cargó con ruta local, intentar con URL remota como último recurso
    const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
    const logoBase64 = await cargarLogoBase64Server(logoUrl);
    if (logoBase64) {
      console.log('[PDF Server] Logo remoto cargado como fallback');
      return logoBase64;
    }
    
    return null;
  } catch (error) {
    console.error('[PDF Server] Error general al cargar logo PNG:', error);
    return null;
  }
}

// Función auxiliar para dibujar gráfico de barras
function dibujarGraficoBarras(doc, x, y, width, height, data, labels, colors) {
  if (!data || data.length === 0) return;
  
  const maxValue = Math.max(...data);
  if (maxValue === 0) return;
  
  const barWidth = width / data.length - 5;
  const barSpacing = 5;
  
  // Dibujar ejes
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(x, y, x, y + height); // Eje Y
  doc.line(x, y + height, x + width, y + height); // Eje X
  
  // Dibujar barras
  data.forEach((value, index) => {
    if (value <= 0) return;
    
    const barHeight = (value / maxValue) * height;
    const barX = x + (barWidth + barSpacing) * index + barSpacing;
    const barY = y + height - barHeight;
    
    const color = colors && colors[index] ? colors[index] : [20, 38, 120];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(barX, barY, barWidth, barHeight, 'F');
    
    // Valor encima
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    const valueText = value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(0);
    doc.text(valueText, barX + barWidth / 2, barY - 2, { align: 'center' });
    
    // Etiqueta
    if (labels && labels[index]) {
      doc.setFontSize(7);
      const label = labels[index].substring(0, 12);
      doc.text(label, barX + barWidth / 2, y + height + 5, { align: 'center' });
    }
  });
}

// Función auxiliar para dibujar gráfico de pastel
// Función auxiliar para dibujar gráfico de líneas tipo electrocardiograma
function dibujarGraficoLineas(doc, x, y, width, height, series, colors) {
  if (!series || series.length === 0) return;
  
  // Encontrar valores máximos y mínimos de todas las series
  let maxValue = 0;
  let minValue = Infinity;
  
  series.forEach(serie => {
    if (serie.data && serie.data.length > 0) {
      const validData = serie.data.filter(v => !isNaN(v) && isFinite(v) && v !== null && v !== undefined);
      if (validData.length > 0) {
        const serieMax = Math.max(...validData);
        const serieMin = Math.min(...validData);
        maxValue = Math.max(maxValue, serieMax);
        minValue = Math.min(minValue, serieMin);
      }
    }
  });
  
  if (maxValue === 0 && minValue === Infinity) return;
  
  // Ajustar rango para mejor visualización
  const range = maxValue - minValue;
  const padding = range * 0.1 || maxValue * 0.1 || 1;
  const adjustedMax = maxValue + padding;
  const adjustedMin = Math.max(0, minValue - padding);
  const adjustedRange = adjustedMax - adjustedMin || 1;
  
  // Dibujar fondo blanco para el área del gráfico
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(x, y, width, height, 'FD');
  
  // Dibujar ejes y grid
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  
  // Líneas horizontales (grid)
  for (let i = 0; i <= 5; i++) {
    const gridY = y + (height / 5) * i;
    doc.line(x, gridY, x + width, gridY);
    
    // Etiquetas del eje Y
    if (i < 5) {
      const value = adjustedMax - (adjustedRange / 5) * i;
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 100);
      const valueText = value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(0);
      doc.text(valueText, x - 2, gridY + 2, { align: 'right' });
    }
  }
  
  // Eje Y (vertical izquierdo)
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.line(x, y, x, y + height);
  
  // Eje X (horizontal inferior)
  doc.line(x, y + height, x + width, y + height);
  
  // Dibujar cada serie de datos
  series.forEach((serie, serieIndex) => {
    if (!serie.data || serie.data.length === 0) return;
    
    const color = colors && colors[serieIndex] ? colors[serieIndex] : [20, 38, 120];
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(1.5);
    
    const pointSpacing = serie.data.length > 1 ? width / (serie.data.length - 1) : width;
    const points = [];
    
    // Calcular puntos
    serie.data.forEach((value, index) => {
      const normalizedValue = ((value - adjustedMin) / adjustedRange) || 0;
      const pointX = x + index * pointSpacing;
      const pointY = y + height - (normalizedValue * height);
      points.push([pointX, pointY]);
    });
    
    // Dibujar línea conectando los puntos
    if (points.length > 1) {
      for (let i = 0; i < points.length - 1; i++) {
        doc.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
      }
      
      // Dibujar puntos
      doc.setFillColor(color[0], color[1], color[2]);
      points.forEach(point => {
        doc.circle(point[0], point[1], 1, 'F');
      });
    } else if (points.length === 1) {
      // Si solo hay un punto, dibujarlo
      doc.setFillColor(color[0], color[1], color[2]);
      doc.circle(points[0][0], points[0][1], 1.5, 'F');
    }
    
    // Leyenda
    if (serie.label) {
      const legendX = x + width - 45;
      const legendY = y - 15 + (serieIndex * 7);
      
      // Cuadrado de color
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(legendX, legendY - 2.5, 5, 5, 'F');
      
      // Etiqueta
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text(serie.label.substring(0, 15), legendX + 7, legendY, { align: 'left' });
    }
  });
}

// Función auxiliar para dibujar una tabla de KPIs
function dibujarTablaKPIs(doc, x, y, width, kpis, colores) {
  const cellHeight = 12;
  const cellPadding = 4;
  const cols = 3;
  const cellWidth = (width - (cols - 1) * 2) / cols;
  
  let col = 0;
  let row = 0;
  
  kpis.forEach((kpi, index) => {
    const cellX = x + col * (cellWidth + 2);
    const cellY = y + row * (cellHeight + 2);
    
    // Fondo de la celda
    const color = colores[index % colores.length];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(cellX, cellY, cellWidth, cellHeight, 'FD');
    
    // Título del KPI
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(255, 255, 255);
    const titulo = doc.splitTextToSize(kpi.label, cellWidth - cellPadding * 2);
    doc.text(titulo, cellX + cellPadding, cellY + 3, { maxWidth: cellWidth - cellPadding * 2 });
    
    // Valor del KPI
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    const valor = doc.splitTextToSize(kpi.value, cellWidth - cellPadding * 2);
    doc.text(valor, cellX + cellPadding, cellY + 8, { maxWidth: cellWidth - cellPadding * 2 });
    
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  });
  
  return y + (row + 1) * (cellHeight + 2);
}

// Función auxiliar para dibujar tabla de datos con manejo de texto multilínea
function dibujarTabla(doc, x, y, width, headers, rows, fontSize = 8, pageWidth, pageHeight, azulMarca) {
  const headerHeight = 10;
  const baseRowHeight = 7;
  const cellPadding = 3;
  const lineHeight = 5;
  
  const colWidths = headers.map(() => width / headers.length);
  
  // Header de tabla (azul más oscuro para contraste sobre fondo azul)
  doc.setFillColor(10, 20, 60);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(x, y, width, headerHeight, 'FD');
  
  doc.setFontSize(fontSize);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  
  headers.forEach((header, i) => {
    const cellX = x + colWidths.slice(0, i).reduce((sum, w) => sum + w, 0);
    const align = i >= headers.length - 2 ? 'right' : 'left'; // Últimas columnas alineadas a la derecha
    doc.text(header, cellX + (align === 'right' ? colWidths[i] - cellPadding : cellPadding), 
      y + headerHeight / 2 + 2, { align, maxWidth: colWidths[i] - cellPadding * 2 });
  });
  
  let currentY = y + headerHeight;
  
  // Rows
  rows.forEach((row, rowIndex) => {
    // Calcular altura necesaria para esta fila (texto puede ser multilínea)
    const maxLines = row.map((cell, i) => {
      const cellWidth = colWidths[i] - cellPadding * 2;
      const cellText = String(cell);
      const splitText = doc.splitTextToSize(cellText, cellWidth);
      return splitText.length;
    }).reduce((max, lines) => Math.max(max, lines), 1);
    
    const rowHeight = Math.max(baseRowHeight, maxLines * lineHeight + 2);
    
    // Verificar si necesitamos nueva página
    if (currentY + rowHeight > pageHeight - 35) {
      doc.addPage();
      // Dibujar fondo azul en nueva página
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      currentY = 20;
      // Redibujar header de tabla
      doc.setFillColor(10, 20, 60);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(x, currentY, width, headerHeight, 'FD');
      doc.setFontSize(fontSize);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      headers.forEach((header, i) => {
        const cellX = x + colWidths.slice(0, i).reduce((sum, w) => sum + w, 0);
        const align = i >= headers.length - 2 ? 'right' : 'left';
        doc.text(header, cellX + (align === 'right' ? colWidths[i] - cellPadding : cellPadding), 
          currentY + headerHeight / 2 + 2, { align, maxWidth: colWidths[i] - cellPadding * 2 });
      });
      currentY += headerHeight;
    }
    
    // Color de fondo para filas (blanco sobre fondo azul)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(x, currentY, width, rowHeight, 'FD');
    
    doc.setFontSize(fontSize - 1);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    
    // Dibujar cada celda con manejo de texto multilínea
    row.forEach((cell, i) => {
      const cellX = x + colWidths.slice(0, i).reduce((sum, w) => sum + w, 0);
      const cellWidth = colWidths[i] - cellPadding * 2;
      const align = i >= headers.length - 2 ? 'right' : 'left';
      
      const cellText = String(cell);
      const splitText = doc.splitTextToSize(cellText, cellWidth);
      const cellLines = splitText.length;
      
      // Calcular posición vertical para centrar verticalmente si hay múltiples líneas
      const textStartY = currentY + (rowHeight / 2) - ((cellLines - 1) * lineHeight / 2) + 2;
      
      // Dibujar cada línea del texto
      splitText.forEach((line, lineIndex) => {
        const lineY = textStartY + (lineIndex * lineHeight);
        doc.text(line, cellX + (align === 'right' ? colWidths[i] - cellPadding : cellPadding), 
          lineY, { align, maxWidth: cellWidth });
      });
    });
    
    currentY += rowHeight;
  });
  
  return currentY;
}

// Generar PDF del informe (versión servidor)
async function generarInformePDFServer(informe, totals, request) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const azulMarca = [20, 38, 120];
  const blanco = [255, 255, 255];
  const grisClaro = [200, 200, 200];
  const grisFondo = [245, 245, 245];
  const coloresGraficos = [
    [20, 38, 120], [59, 130, 246], [16, 185, 129],
    [245, 158, 11], [239, 68, 68], [139, 92, 246]
  ];
  
  // Funciones auxiliares de formateo
  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  
  const formatearMoneda = (monto) => {
    if (monto === null || monto === undefined || isNaN(monto)) return '$0';
    const num = Number(monto);
    // Formatear moneda sin decimales innecesarios (solo mostrar si existen)
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: informe.moneda || 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(monto);
  };
  
  const formatearNumero = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    const value = Number(num);
    // Si es un número entero, no mostrar decimales
    const isInteger = value % 1 === 0;
    if (isInteger) {
      return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
    // Para números con decimales, mostrar solo los decimales necesarios (hasta 2)
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value);
  };
  
  const formatearPorcentaje = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '0%';
    const num = Number(val);
    // Si es un número entero, no mostrar decimales
    const isInteger = num % 1 === 0;
    return `${num.toFixed(isInteger ? 0 : 2)}%`;
  };

  // Obtener label formateado para una métrica
  const getMetricLabel = (key) => {
    const labels = {
      spend: 'Spend',
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

  // Formatear valor de métrica según su tipo
  const formatMetricValue = (key, value) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    if (isPercentageMetric(key)) {
      return formatearPorcentaje(value);
    }
    if (isCurrencyMetric(key)) {
      return formatearMoneda(value);
    }
    return formatearNumero(value);
  };
  
  // Dibujar fondo azul en toda la página
  doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  let yPos = 20;
  
  // Título (sin logo)
  const tituloTexto = informe.titulo || 'Informe';
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.text(tituloTexto, pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 15;
  
  // Información del informe (texto blanco sobre fondo azul)
  doc.setFontSize(12);
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  
  doc.setFont(undefined, 'bold');
  doc.text('Cliente:', 20, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(informe.clienteNombre || 'N/A', 50, yPos);
  
  yPos += 8;
  if (informe.clienteEmail) {
    doc.setFont(undefined, 'bold');
    doc.text('Email:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(informe.clienteEmail, 50, yPos);
    yPos += 8;
  }
  
  doc.setFont(undefined, 'bold');
  doc.text('Período:', 20, yPos);
  doc.setFont(undefined, 'normal');
  const periodoTexto = informe.periodo 
    ? `${formatearFecha(informe.periodo.from)} - ${formatearFecha(informe.periodo.to)}`
    : 'N/A';
  doc.text(periodoTexto, 50, yPos);
  
  yPos += 8;
  const monedaTexto = informe.moneda || 'ARS';
  doc.setFont(undefined, 'bold');
  doc.text('Moneda:', 20, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(monedaTexto, 50, yPos);
  
  yPos += 15;
  
  // KPIs Principales - Cards estilo CRM
  if (totals && totals.totalsGlobal) {
    const tg = totals.totalsGlobal;
    
    if (yPos > pageHeight - 100) {
      doc.addPage();
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Resumen Ejecutivo', 20, yPos);
    yPos += 12;
    
    // Cards principales (3 columnas)
    const cardWidth = (pageWidth - 50) / 3;
    const cardHeight = 22;
    let cardX = 20;
    let cardY = yPos;
    let cardsInRow = 0;
    
    // Card: Spend Total
    if (tg.spend !== undefined && tg.spend > 0) {
      doc.setFillColor(30, 41, 59); // slate-800
      doc.setDrawColor(51, 65, 85); // slate-700
      doc.setLineWidth(0.5);
      doc.rect(cardX, cardY, cardWidth, cardHeight, 'FD');
      
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('Spend Total', cardX + 8, cardY + 7);
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text(formatearMoneda(tg.spend), cardX + 8, cardY + 16);
      
      cardsInRow++;
      cardX += cardWidth + 5;
    }
    
    // Card: Impresiones
    if (tg.impressions > 0) {
      if (cardsInRow >= 3) {
        cardsInRow = 0;
        cardX = 20;
        cardY += cardHeight + 5;
      }
      
      doc.setFillColor(30, 41, 59);
      doc.setDrawColor(51, 65, 85);
      doc.rect(cardX, cardY, cardWidth, cardHeight, 'FD');
      
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Impresiones', cardX + 8, cardY + 7);
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text(formatearNumero(tg.impressions), cardX + 8, cardY + 16);
      
      cardsInRow++;
      cardX += cardWidth + 5;
    }
    
    // Card: Clicks
    if (tg.clicks > 0) {
      if (cardsInRow >= 3) {
        cardsInRow = 0;
        cardX = 20;
        cardY += cardHeight + 5;
      }
      
      doc.setFillColor(30, 41, 59);
      doc.setDrawColor(51, 65, 85);
      doc.rect(cardX, cardY, cardWidth, cardHeight, 'FD');
      
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Clicks', cardX + 8, cardY + 7);
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text(formatearNumero(tg.clicks), cardX + 8, cardY + 16);
      
      cardsInRow++;
      cardX += cardWidth + 5;
    }
    
    yPos = cardY + cardHeight + 15;
    
    // Totales Globales - Grid de métricas (estilo TotalsPanel)
    if (yPos > pageHeight - 80) {
      doc.addPage();
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Totales Globales', 20, yPos);
    yPos += 12;
    
    const metricCardWidth = (pageWidth - 50) / 4;
    const metricCardHeight = 18;
    let metricX = 20;
    let metricY = yPos;
    let metricsPerRow = 0;
    
    const metricas = [];
    if (tg.spend > 0) metricas.push({ label: 'Spend', value: formatearMoneda(tg.spend) });
    if (tg.impressions > 0) metricas.push({ label: 'Impresiones', value: formatearNumero(tg.impressions) });
    if (tg.clicks > 0) metricas.push({ label: 'Clicks', value: formatearNumero(tg.clicks) });
    if (tg.ctr > 0) metricas.push({ label: 'CTR', value: formatearPorcentaje(tg.ctr) });
    if (tg.conversations > 0) metricas.push({ label: 'Conversaciones', value: formatearNumero(tg.conversations) });
    if (tg.conversions > 0) metricas.push({ label: 'Conversiones', value: formatearNumero(tg.conversions) });
    if (tg.cpc > 0) metricas.push({ label: 'CPC', value: formatearMoneda(tg.cpc) });
    if (tg.cpa > 0) metricas.push({ label: 'CPA', value: formatearMoneda(tg.cpa) });
    if (tg.costPerConversation > 0) metricas.push({ label: 'Costo/Conversación', value: formatearMoneda(tg.costPerConversation) });
    if (tg.cpm > 0) metricas.push({ label: 'CPM', value: formatearMoneda(tg.cpm) });
    if (tg.frequency > 0) metricas.push({ label: 'Frecuencia', value: tg.frequency.toFixed(2) });
    if (tg.reach > 0) metricas.push({ label: 'Alcance', value: formatearNumero(tg.reach) });
    
    metricas.forEach((metrica, index) => {
      if (metricY + metricCardHeight > pageHeight - 50) {
        doc.addPage();
        doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        metricY = 20;
        metricX = 20;
        metricsPerRow = 0;
      }
      
      // Card de métrica (slate-900/50)
      doc.setFillColor(15, 23, 42);
      doc.setDrawColor(51, 65, 85);
      doc.setLineWidth(0.3);
      doc.rect(metricX, metricY, metricCardWidth, metricCardHeight, 'FD');
      
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(metrica.label, metricX + 5, metricY + 6);
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      const valueLines = doc.splitTextToSize(metrica.value, metricCardWidth - 10);
      doc.text(valueLines, metricX + 5, metricY + 13);
      
      metricsPerRow++;
      if (metricsPerRow >= 4) {
        metricsPerRow = 0;
        metricX = 20;
        metricY += metricCardHeight + 5;
      } else {
        metricX += metricCardWidth + 5;
      }
    });
    
    if (metricsPerRow > 0) {
      yPos = metricY + metricCardHeight + 10;
    } else {
      yPos = metricY + 10;
    }
  }
  
  // Totales por Plataforma - Cards individuales estilo CRM
  if (totals && totals.totalsByPlatform) {
    const platforms = Object.keys(totals.totalsByPlatform);
    if (platforms.length > 0) {
      if (yPos > pageHeight - 100) {
        doc.addPage();
        doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        yPos = 20;
      }
      
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text('Totales por Plataforma', 20, yPos);
      yPos += 12;
      
      const platformNames = {
        meta: 'Meta Ads',
        google: 'Google Ads',
        otro: 'Otro'
      };
      
      platforms.forEach((platform) => {
        const tp = totals.totalsByPlatform[platform];
        const platformName = platformNames[platform] || platform;
        
        if (yPos > pageHeight - 80) {
          doc.addPage();
          doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          yPos = 20;
        }
        
        // Card de plataforma
        doc.setFillColor(30, 41, 59);
        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(0.5);
        const platformCardHeight = 50;
        doc.rect(20, yPos, pageWidth - 40, platformCardHeight, 'FD');
        
        // Título de plataforma
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(blanco[0], blanco[1], blanco[2]);
        doc.text(platformName, 28, yPos + 8);
        
        // Métricas en grid (4 columnas)
        const platformMetricWidth = (pageWidth - 60) / 4;
        let platformMetricX = 28;
        let platformMetricY = yPos + 15;
        let platformMetricsPerRow = 0;
        
        const platformMetricas = [];
        if (tp.spend > 0) platformMetricas.push({ label: 'Spend', value: formatearMoneda(tp.spend) });
        if (tp.impressions > 0) platformMetricas.push({ label: 'Impresiones', value: formatearNumero(tp.impressions) });
        if (tp.clicks > 0) platformMetricas.push({ label: 'Clicks', value: formatearNumero(tp.clicks) });
        if (tp.ctr > 0) platformMetricas.push({ label: 'CTR', value: formatearPorcentaje(tp.ctr) });
        if (tp.cpc > 0) platformMetricas.push({ label: 'CPC', value: formatearMoneda(tp.cpc) });
        if (tp.conversations > 0) platformMetricas.push({ label: 'Conversaciones', value: formatearNumero(tp.conversations) });
        if (tp.conversions > 0) platformMetricas.push({ label: 'Conversaciones', value: formatearNumero(tp.conversions) });
        
        platformMetricas.forEach((metrica) => {
          // Card pequeña de métrica
          doc.setFillColor(15, 23, 42);
          doc.setDrawColor(51, 65, 85);
          doc.setLineWidth(0.3);
          const smallCardHeight = 16;
          doc.rect(platformMetricX, platformMetricY, platformMetricWidth - 5, smallCardHeight, 'FD');
          
          doc.setFontSize(6);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(148, 163, 184);
          doc.text(metrica.label, platformMetricX + 3, platformMetricY + 5);
          
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(blanco[0], blanco[1], blanco[2]);
          const valueText = doc.splitTextToSize(metrica.value, platformMetricWidth - 10);
          doc.text(valueText, platformMetricX + 3, platformMetricY + 11);
          
          platformMetricsPerRow++;
          if (platformMetricsPerRow >= 4) {
            platformMetricsPerRow = 0;
            platformMetricX = 28;
            platformMetricY += smallCardHeight + 3;
          } else {
            platformMetricX += platformMetricWidth;
          }
        });
        
        yPos += platformCardHeight + 10;
      });
    }
  }
  
  // Detalle completo de campañas (igual que en resumen)
  if (informe.sections && informe.sections.length > 0) {
    const platformNames = {
      meta: 'Meta Ads',
      google: 'Google Ads',
      otro: 'Otro'
    };

    if (yPos > pageHeight - 80) {
      doc.addPage();
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Campañas', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    informe.sections.forEach((section, sIdx) => {
      if (!section.items || section.items.length === 0) return;

      const platformName = platformNames[section.platform] || section.platform;

      // Sección - Plataforma
      if (yPos > pageHeight - 100) {
        doc.addPage();
        doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        yPos = 20;
      }

      // Card de plataforma (slate-800)
      const sectionCardHeight = 25;
      doc.setFillColor(30, 41, 59); // slate-800
      doc.setDrawColor(51, 65, 85); // slate-700
      doc.setLineWidth(0.5);
      doc.rect(20, yPos, pageWidth - 40, sectionCardHeight, 'FD');
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      const sectionTitle = section.name ? `${platformName} - ${section.name}` : platformName;
      doc.text(sectionTitle, 28, yPos + 12);
      yPos += sectionCardHeight + 8;

      section.items.forEach((item, iIdx) => {
        // Item - Campaña
        if (yPos > pageHeight - 120) {
          doc.addPage();
          doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          yPos = 20;
        }

        const metrics = item.metrics || {};
        const metricKeys = Object.keys(metrics).filter(key => {
          const value = metrics[key];
          // Excluir frequencyCount y métricas calculadas que no están en los datos originales
          if (key === 'frequencyCount') return false;
          return value !== null && value !== undefined && !isNaN(value) && value !== 0;
        });

        // Calcular altura del card (dinámico según cantidad de métricas)
        const metricsPerRow = 4;
        const numRows = Math.ceil(metricKeys.length / metricsPerRow);
        const itemCardPadding = 12;
        const metricCardHeight = 20;
        const metricSpacing = 5;
        const metricsAreaHeight = numRows * (metricCardHeight + metricSpacing) - metricSpacing;
        
        const hasObjective = item.objective && item.objective.trim();
        const hasNotes = item.notes && item.notes.trim();
        const objectiveHeight = hasObjective ? 8 : 0;
        const notesHeight = hasNotes ? (doc.splitTextToSize(item.notes, pageWidth - 80).length * 4 + 12) : 0;
        const separatorHeight = (hasNotes && metricKeys.length > 0) ? 3 : 0;
        
        const itemCardHeight = itemCardPadding * 2 + 10 + objectiveHeight + metricsAreaHeight + separatorHeight + notesHeight;

        // Card de campaña (slate-900/50)
        doc.setFillColor(15, 23, 42); // slate-900
        doc.setDrawColor(51, 65, 85); // slate-700
        doc.setLineWidth(0.5);
        doc.rect(28, yPos, pageWidth - 56, itemCardHeight, 'FD');

        let itemY = yPos + itemCardPadding;

        // Nombre de campaña
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(226, 232, 240); // slate-200
        doc.text(item.campaignName || 'Sin nombre', 36, itemY);
        itemY += 8;

        // Objetivo
        if (hasObjective) {
          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(148, 163, 184); // slate-400
          doc.text(`Objetivo: ${item.objective}`, 36, itemY);
          itemY += objectiveHeight;
        }

        // Métricas
        if (metricKeys.length > 0) {
          const metricCardWidth = (pageWidth - 80) / metricsPerRow;
          let metricX = 36;
          let metricY = itemY;
          let metricsInRow = 0;

          metricKeys.forEach((key) => {
            // Card de métrica
            doc.setFillColor(15, 23, 42);
            doc.setDrawColor(51, 65, 85);
            doc.setLineWidth(0.3);
            doc.rect(metricX, metricY, metricCardWidth - 5, metricCardHeight, 'FD');

            // Label de métrica
            doc.setFontSize(7);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(148, 163, 184); // slate-400
            const label = getMetricLabel(key);
            doc.text(label, metricX + 3, metricY + 6);

            // Valor de métrica
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(226, 232, 240); // slate-200
            const value = formatMetricValue(key, metrics[key]);
            const valueLines = doc.splitTextToSize(value, metricCardWidth - 10);
            doc.text(valueLines, metricX + 3, metricY + 14);

            metricsInRow++;
            if (metricsInRow >= metricsPerRow) {
              metricsInRow = 0;
              metricX = 36;
              metricY += metricCardHeight + metricSpacing;
            } else {
              metricX += metricCardWidth;
            }
          });

          itemY = metricY + (metricsInRow > 0 ? metricCardHeight + metricSpacing : 0);
        } else {
          itemY += 5; // Espacio mínimo si no hay métricas
        }

        // Separador para notas
        if (hasNotes && metricKeys.length > 0) {
          doc.setDrawColor(51, 65, 85);
          doc.setLineWidth(0.3);
          doc.line(36, itemY, pageWidth - 36, itemY);
          itemY += separatorHeight;
        }

        // Notas
        if (hasNotes) {
          doc.setFontSize(7);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(148, 163, 184); // slate-400
          doc.text('Notas', 36, itemY);
          itemY += 5;
          
          doc.setFontSize(8);
          doc.setTextColor(203, 213, 225); // slate-300
          const notesLines = doc.splitTextToSize(item.notes, pageWidth - 80);
          doc.text(notesLines, 36, itemY);
        }

        yPos += itemCardHeight + 8;
      });
    });
  }
  
  // Observaciones
  if (informe.reportNotes && informe.reportNotes.observaciones) {
    if (yPos > pageHeight - 50) {
      doc.addPage();
      // Dibujar fondo azul en nueva página
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Observaciones', 20, yPos);
    yPos += 8;
    
    // Fondo blanco para observaciones (sobre fondo azul)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    const obsTexto = doc.splitTextToSize(informe.reportNotes.observaciones, pageWidth - 60);
    const obsHeight = obsTexto.length * 5 + 8;
    doc.rect(20, yPos - 2, pageWidth - 40, obsHeight, 'FD');
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(obsTexto, 25, yPos + 3);
    yPos += obsHeight + 8;
  }
  
  // Recomendaciones
  if (informe.reportNotes && informe.reportNotes.recomendaciones) {
    if (yPos > pageHeight - 50) {
      doc.addPage();
      // Dibujar fondo azul en nueva página
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Recomendaciones', 20, yPos);
    yPos += 8;
    
    // Fondo blanco para recomendaciones
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    const recTexto = doc.splitTextToSize(informe.reportNotes.recomendaciones, pageWidth - 60);
    const recHeight = recTexto.length * 5 + 8;
    doc.rect(20, yPos - 2, pageWidth - 40, recHeight, 'FD');
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(recTexto, 25, yPos + 3);
    yPos += recHeight + 8;
  }
  
  // Notas y Recomendaciones
  if (informe.reportNotes && (informe.reportNotes.observaciones || informe.reportNotes.recomendaciones)) {
    if (yPos > pageHeight - 80) {
      doc.addPage();
      // Dibujar fondo azul en nueva página
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }
    
    yPos += 10;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Notas y Recomendaciones', 20, yPos);
    yPos += 12;
    
    // Observaciones
    if (informe.reportNotes.observaciones) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        // Dibujar fondo azul en nueva página
        doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        yPos = 20;
      }
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text('Observaciones', 20, yPos);
      yPos += 8;
      
      // Fondo blanco para observaciones (sobre fondo azul)
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
      const obsTexto = doc.splitTextToSize(informe.reportNotes.observaciones, pageWidth - 60);
      const obsHeight = obsTexto.length * 5 + 8;
      doc.rect(20, yPos - 2, pageWidth - 40, obsHeight, 'FD');
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(obsTexto, 25, yPos + 3);
      yPos += obsHeight + 8;
    }
    
    // Recomendaciones
    if (informe.reportNotes.recomendaciones) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        // Dibujar fondo azul en nueva página
        doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        yPos = 20;
      }
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text('Recomendaciones', 20, yPos);
      yPos += 8;
      
      // Fondo blanco para recomendaciones (sobre fondo azul)
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
      const recTexto = doc.splitTextToSize(informe.reportNotes.recomendaciones, pageWidth - 60);
      const recHeight = recTexto.length * 5 + 8;
      doc.rect(20, yPos - 2, pageWidth - 40, recHeight, 'FD');
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(recTexto, 25, yPos + 3);
      yPos += recHeight + 8;
    }
  }
  
  // Footer en todas las páginas
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Línea separadora del footer (gris claro sobre fondo azul)
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    doc.setLineWidth(0.5);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    
    // Logo de la empresa en el footer (PNG transparente)
    try {
      // Intentar cargar logo PNG local para footer
      const posiblesNombres = ['/Logo.png', '/logo.png', '/LOGO.PNG'];
      let logoBase64Footer = null;
      
      // Construir URL base desde la request si está disponible
      let baseUrl = '';
      try {
        const url = new URL(request?.url || 'http://localhost:3000');
        baseUrl = `${url.protocol}//${url.host}`;
      } catch (e) {
        baseUrl = 'http://localhost:3000';
      }
      
      for (const nombreLogo of posiblesNombres) {
        try {
          const logoUrl = `${baseUrl}${nombreLogo}`;
          logoBase64Footer = await cargarLogoBase64Server(logoUrl);
          if (logoBase64Footer) {
            console.log(`[PDF Server] Logo PNG footer cargado desde ${logoUrl}`);
            break;
          }
        } catch (localError) {
          continue;
        }
      }
      
      if (logoBase64Footer) {
        // Obtener dimensiones manteniendo proporciones (ancho máximo 20mm)
        const logoWidth = 20;
        const logoHeight = 8;
        const formato = logoBase64Footer.includes('png') ? 'PNG' : 
                       logoBase64Footer.includes('jpeg') ? 'JPEG' : 
                       logoBase64Footer.includes('webp') ? 'WEBP' : 'PNG';
        doc.addImage(logoBase64Footer, formato, pageWidth / 2 - logoWidth / 2, pageHeight - 20, logoWidth, logoHeight);
      } else {
        // Fallback a texto
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(blanco[0], blanco[1], blanco[2]);
        doc.text('Digital Space', pageWidth / 2, pageHeight - 15, { align: 'center' });
      }
    } catch (error) {
      console.error('[PDF Server] Error al cargar logo footer:', error);
      // Fallback a texto
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text('Digital Space', pageWidth / 2, pageHeight - 15, { align: 'center' });
    }
    
    // Número de página
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }
  
  return doc.output('arraybuffer');
}

// GET /api/reports/[id]/pdf - Exportar informe a PDF
export async function GET(request, { params }) {
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
        report = await Report.findById(params.id).lean();
      } catch (idError) {
        // Continuar para buscar por reportId
      }
    }
    
    if (!report) {
      report = await Report.findOne({ reportId: params.id }).lean();
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
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }
    
    // Calcular totales
    const totals = calculateReportTotals(report);
    
    // Generar PDF
    const pdfBuffer = await generarInformePDFServer(report, totals, request);
    
    // Generar nombre del archivo
    const nombreLimpio = report.titulo?.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, ' ') || 'Informe';
    const nombreArchivo = `${nombreLimpio}.pdf`;
    
    // Devolver PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(nombreArchivo)}"`,
        'Content-Length': pdfBuffer.byteLength.toString()
      }
    });
  } catch (error) {
    console.error('[API Reports GET /[id]/pdf] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

