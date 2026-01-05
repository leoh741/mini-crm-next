"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getReportById, deleteReport, duplicateReport } from "../../../lib/reportsUtils";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";
import TotalsPanel from "../../../components/reports/TotalsPanel";
import SharePanel from "../../../components/reports/SharePanel";
import { formatNumber, formatPercentage } from "../../../lib/reportCalculations";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function InformeDetallePageContent() {
  const params = useParams();
  const router = useRouter();
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("resumen");
  const [deleting, setDeleting] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const resumenRef = useRef(null);

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
      const duplicated = await duplicateReport(informe._id || informe.reportId);
      if (duplicated) {
        router.push(`/informes/${duplicated._id || duplicated.reportId}`);
      }
    } catch (err) {
      console.error('Error al duplicar:', err);
      alert("Error al duplicar el informe: " + err.message);
    }
  };

  const handleShareUpdate = (updatedInforme) => {
    setInforme(updatedInforme);
  };

  // Función auxiliar para cargar imagen a base64
  const cargarLogoBase64 = async (url) => {
    return new Promise((resolve, reject) => {
      // Intentar con fetch primero
      fetch(url, { mode: 'cors', cache: 'no-cache' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return response.blob();
        })
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
        .catch(() => {
          // Fallback: intentar con Image (puede fallar por CORS)
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function() {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
            } catch (error) {
              reject(error);
            }
          };
          img.onerror = reject;
          img.src = url;
        });
    });
  };

  const handleDownloadPDF = async () => {
    try {
      setDownloadingPDF(true);
      
      // Asegurar que el tab de resumen esté activo
      if (activeTab !== "resumen") {
        setActiveTab("resumen");
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Buscar el elemento del resumen
      const resumenElement = resumenRef.current;
      if (!resumenElement) {
        throw new Error("No se pudo encontrar el contenido del resumen");
      }
      
      // Función para cargar logo (misma que en pdfGenerator)
      
      // Función para obtener dimensiones del logo manteniendo proporciones
      const obtenerDimensionesLogo = async (base64, anchoMaximo) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = function() {
            const aspectRatio = img.width / img.height;
            const logoWidth = anchoMaximo;
            const logoHeight = logoWidth / aspectRatio;
            resolve({ width: logoWidth, height: logoHeight });
          };
          img.onerror = function() {
            // Si falla, usar dimensiones por defecto con aspect ratio típico
            const logoWidth = anchoMaximo;
            const logoHeight = logoWidth / 2;
            resolve({ width: logoWidth, height: logoHeight });
          };
          img.src = base64;
        });
      };
      
      // Crear PDF usando jsPDF (igual que presupuestos y resúmenes)
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Color azul del header del CRM (RGB: 20, 38, 120 - #142678)
      const azulMarca = [20, 38, 120];
      const blanco = [255, 255, 255];
      
      // Dibujar fondo azul en toda la página
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      let yPos = 20;
      
      // Logo en header
      try {
        const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
        const logoBase64 = await cargarLogoBase64(logoUrl);
        if (logoBase64) {
          const logoWidth = 60;
          const logoHeight = 20;
          const formato = logoBase64.startsWith('data:image/png') ? 'PNG' : 
                         logoBase64.startsWith('data:image/webp') ? 'WEBP' : 
                         logoBase64.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(logoBase64, formato, pageWidth / 2 - logoWidth / 2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + 10;
        }
      } catch (error) {
        console.warn('Error al cargar logo del header:', error);
      }
      
      // Título del informe
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(blanco[0], blanco[1], blanco[2]);
      doc.text(informe.titulo || 'Informe', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;
      
      // Información del cliente y período
      doc.setFontSize(12);
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
      doc.text(formatearPeriodo(informe.periodo), 50, yPos);
      yPos += 15;
      
      // Dividir el contenido en contenedores individuales para evitar cortar elementos
      const footerHeight = 30; // Espacio para logo y número de página
      const imgWidth = pageWidth - 40; // Margen de 20mm cada lado
      
      // Función auxiliar para verificar si un elemento cabe en la página actual
      const getElementHeight = async (element) => {
        const canvas = await html2canvas(element, {
          backgroundColor: null,
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false
        });
        return (canvas.height * imgWidth) / canvas.width;
      };
      
      // Función auxiliar para agregar una imagen al PDF con manejo de páginas
      const addElementToPDF = async (element, addSpace = true) => {
        const canvas = await html2canvas(element, {
          backgroundColor: null, // Fondo transparente
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Calcular la altura disponible en la página actual
        const availableHeight = pageHeight - yPos - footerHeight;
        
        // Si este elemento no cabe en la página actual, crear una nueva página
        if (yPos > 20 && imgHeight > availableHeight) {
          doc.addPage();
          // Dibujar fondo azul en la nueva página
          doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          yPos = 20; // Reiniciar Y para la nueva página
        }
        
        // Agregar este elemento al PDF
        doc.addImage(imgData, 'PNG', 20, yPos, imgWidth, imgHeight);
        yPos += imgHeight + (addSpace ? 10 : 0); // Agregar espacio entre elementos si se solicita
        
        // Verificar si después de agregar este elemento necesitamos una nueva página
        if (yPos > pageHeight - footerHeight) {
          doc.addPage();
          // Dibujar fondo azul en la nueva página
          doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          yPos = 20; // Reiniciar Y para la nueva página
        }
      };
      
      // Obtener todos los elementos hijos directos del resumen
      const children = Array.from(resumenElement.children);
      
      for (let i = 0; i < children.length; i++) {
        const childElement = children[i];
        
        // Si es el contenedor de "Campañas", dividir cada sección (plataforma) por páginas
        const campanasTitle = childElement.querySelector('h3');
        if (campanasTitle && campanasTitle.textContent.trim() === 'Campañas') {
          // Este es el contenedor de campañas
          const secciones = childElement.querySelectorAll('.bg-slate-800.border.border-slate-700.rounded-lg');
          
          // Procesar cada sección (plataforma)
          for (const seccion of secciones) {
            try {
              const seccionHeader = seccion.querySelector('h4');
              const campanasContainer = seccion.querySelector('.space-y-4');
              
              if (!campanasContainer || campanasContainer.children.length === 0) {
                // Si no hay campañas, agregar la sección completa
                await addElementToPDF(seccion, true);
                continue;
              }
              
              // Obtener todas las campañas de esta sección
              const campanasItems = Array.from(campanasContainer.children);
              
              // Calcular la altura del header de la sección
              const headerWrapper = document.createElement('div');
              headerWrapper.style.position = 'absolute';
              headerWrapper.style.left = '-9999px';
              headerWrapper.style.width = resumenElement.offsetWidth + 'px';
              headerWrapper.className = 'bg-slate-800 border border-slate-700 rounded-lg p-6';
              if (seccionHeader) {
                const clonedHeader = seccionHeader.cloneNode(true);
                headerWrapper.appendChild(clonedHeader);
              }
              document.body.appendChild(headerWrapper);
              
              let headerHeight = 0;
              try {
                headerHeight = await getElementHeight(headerWrapper);
              } finally {
                if (document.body.contains(headerWrapper)) {
                  document.body.removeChild(headerWrapper);
                }
              }
              
              // Dividir las campañas en grupos que quepan en cada página
              let campanaIndex = 0;
              
              while (campanaIndex < campanasItems.length) {
                // Crear un contenedor temporal para este grupo de campañas
                const sectionWrapper = document.createElement('div');
                sectionWrapper.style.position = 'absolute';
                sectionWrapper.style.left = '-9999px';
                sectionWrapper.style.width = resumenElement.offsetWidth + 'px';
                sectionWrapper.className = 'bg-slate-800 border border-slate-700 rounded-lg p-6';
                
                // Agregar el header de la sección
                if (seccionHeader) {
                  const clonedHeader = seccionHeader.cloneNode(true);
                  sectionWrapper.appendChild(clonedHeader);
                }
                
                // Crear contenedor para las campañas
                const campanasGroup = document.createElement('div');
                campanasGroup.className = 'space-y-4 mt-4';
                sectionWrapper.appendChild(campanasGroup);
                
                // Agregar campañas mientras quepan en la página
                let currentHeight = headerHeight + 24; // header + padding inicial
                const currentAvailableHeight = pageHeight - yPos - footerHeight;
                const spacingBetweenCampanas = 16; // espacio-y-4
                
                while (campanaIndex < campanasItems.length) {
                  const campana = campanasItems[campanaIndex];
                  const clonedCampana = campana.cloneNode(true);
                  campanasGroup.appendChild(clonedCampana);
                  
                  // Calcular altura de esta campaña
                  const campanaHeight = await getElementHeight(clonedCampana);
                  const newTotalHeight = currentHeight + campanaHeight + spacingBetweenCampanas;
                  
                  // Si agregar esta campaña excede el espacio disponible, detener
                  if (newTotalHeight > currentAvailableHeight && campanasGroup.children.length > 0) {
                    campanasGroup.removeChild(clonedCampana);
                    break;
                  }
                  
                  currentHeight = newTotalHeight;
                  campanaIndex++;
                }
                
                // Si hay campañas en este grupo, agregarlo al PDF
                if (campanasGroup.children.length > 0) {
                  document.body.appendChild(sectionWrapper);
                  
                  try {
                    const sectionHeight = await getElementHeight(sectionWrapper);
                    const availableHeight = pageHeight - yPos - footerHeight;
                    
                    // Si este grupo no cabe en la página actual, crear nueva página
                    if (sectionHeight > availableHeight && yPos > 20) {
                      doc.addPage();
                      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
                      doc.rect(0, 0, pageWidth, pageHeight, 'F');
                      yPos = 20;
                    }
                    
                    await addElementToPDF(sectionWrapper, true);
                  } finally {
                    if (document.body.contains(sectionWrapper)) {
                      document.body.removeChild(sectionWrapper);
                    }
                  }
                }
              }
            } catch (sectionError) {
              console.warn('Error al procesar sección:', sectionError);
              // Continuar con la siguiente sección
            }
          }
        } else {
          // Para otros elementos (Importe gastado total, Totales por Plataforma), agregarlos directamente
          await addElementToPDF(childElement, true);
        }
      }
      
      // Obtener el número total de páginas después de agregar la imagen
      const totalPages = doc.internal.pages.length - 1;
      
      // Agregar logo y número de página en cada página
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Logo en footer
        try {
          let logoBase64 = null;
          try {
            logoBase64 = await cargarLogoBase64(`${window.location.origin}/Logo.png`);
          } catch (localError) {
            logoBase64 = await cargarLogoBase64('https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp');
          }
          if (logoBase64) {
            // Obtener dimensiones manteniendo proporciones originales
            const dimensiones = await obtenerDimensionesLogo(logoBase64, 20); // Ancho máximo 20mm
            const logoWidth = dimensiones.width;
            const logoHeight = dimensiones.height;
            const logoY = pageHeight - 25;
            const formato = logoBase64.startsWith('data:image/png') ? 'PNG' : 
                           logoBase64.startsWith('data:image/webp') ? 'WEBP' : 
                           logoBase64.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
            doc.addImage(logoBase64, formato, pageWidth / 2 - logoWidth / 2, logoY, logoWidth, logoHeight);
          }
        } catch (error) {
          console.warn('Error al cargar logo del footer:', error);
        }
        
        // Número de página
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(blanco[0], blanco[1], blanco[2]);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      }
      
      // Guardar PDF
      const nombreArchivo = `${informe.titulo?.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, ' ') || 'Informe'}.pdf`;
      doc.save(nombreArchivo);
      
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex-1">
          <Link href="/informes" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
            ← Volver a Informes
          </Link>
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
            <span className={`px-2 py-1 rounded text-xs border ${
              informe.estado === 'publicado' 
                ? 'bg-green-900/30 text-green-400 border-green-700'
                : 'bg-gray-900/30 text-gray-400 border-gray-700'
            }`}>
              {informe.estado === 'publicado' ? 'Publicado' : 'Borrador'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF || loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            {downloadingPDF ? (
              <>
                <Icons.Refresh className="w-4 h-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Icons.Download className="w-4 h-4" />
                Descargar PDF
              </>
            )}
          </button>
          <Link
            href={`/informes/${informe._id || informe.reportId}/editar`}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            <Icons.Pencil className="w-4 h-4" />
            Editar
          </Link>
          <button
            onClick={handleDuplicate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            <Icons.Duplicate className="w-4 h-4" />
            Duplicar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            <Icons.Trash className="w-4 h-4" />
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700 mb-6">
        <div className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 border-b-2 transition-colors ${
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
        <div ref={resumenRef} className="space-y-6">
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

