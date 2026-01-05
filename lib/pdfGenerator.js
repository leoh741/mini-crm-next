import jsPDF from 'jspdf';

// Función auxiliar para cargar imagen y convertirla a base64 usando canvas
async function cargarLogoBase64(url) {
  console.log('[PDF] Intentando cargar logo desde:', url);
  
  return new Promise((resolve, reject) => {
    // Primero intentar con fetch (más confiable para CORS)
    fetch(url, { mode: 'cors', cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        console.log('[PDF] Logo descargado exitosamente');
        return response.blob();
      })
      .then(blob => {
        console.log('[PDF] Convirtiendo blob a base64...');
        return new Promise((resolveBlob, rejectBlob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result;
            console.log('[PDF] Logo convertido a base64, longitud:', base64.length);
            resolve(base64);
          };
          reader.onerror = (error) => {
            console.error('[PDF] Error en FileReader:', error);
            rejectBlob(error);
          };
          reader.readAsDataURL(blob);
        });
      })
      .catch(fetchError => {
        console.warn('[PDF] Error con fetch, intentando con Image:', fetchError);
        // Fallback: intentar con Image y canvas
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
          try {
            console.log('[PDF] Imagen cargada con Image, convirtiendo a canvas...');
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const base64 = canvas.toDataURL('image/png');
            console.log('[PDF] Logo convertido a base64 desde canvas, longitud:', base64.length);
            resolve(base64);
          } catch (error) {
            console.error('[PDF] Error al convertir imagen a base64:', error);
            reject(error);
          }
        };
        
        img.onerror = function(error) {
          console.error('[PDF] Error al cargar imagen con Image:', error);
          reject(error);
        };
        
        img.src = url;
      });
  });
}

// Función auxiliar para obtener dimensiones de una imagen manteniendo proporciones
async function obtenerDimensionesLogo(base64, anchoMaximo) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      const aspectRatio = img.width / img.height;
      const logoWidth = anchoMaximo;
      const logoHeight = logoWidth / aspectRatio;
      console.log(`[PDF] Dimensiones originales: ${img.width}x${img.height}, Aspect ratio: ${aspectRatio.toFixed(2)}`);
      console.log(`[PDF] Dimensiones calculadas: ${logoWidth.toFixed(2)}x${logoHeight.toFixed(2)}`);
      resolve({ width: logoWidth, height: logoHeight });
    };
    img.onerror = function() {
      // Si falla, usar dimensiones por defecto con aspect ratio típico (2:1)
      const logoWidth = anchoMaximo;
      const logoHeight = logoWidth / 2;
      console.warn('[PDF] No se pudieron obtener dimensiones, usando aspect ratio por defecto 2:1');
      resolve({ width: logoWidth, height: logoHeight });
    };
    img.src = base64;
  });
}

export async function generarResumenPagoPDF(cliente, estadoPagoMes = null) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Color azul del header del CRM (RGB: 20, 38, 120 - #142678)
  const azulMarca = [20, 38, 120];
  const blanco = [255, 255, 255];
  const grisClaro = [200, 200, 200];
  
  // Dibujar fondo azul en toda la página
  doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  let yPos = 20;

  // Logo de la empresa en el header - cargar como base64 para asegurar que aparezca
  try {
    const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
    console.log('[PDF] Cargando logo para header (resumen de pago)...');
    const logoBase64 = await cargarLogoBase64(logoUrl);
    if (logoBase64) {
      console.log('[PDF] Logo cargado, agregando al PDF (resumen de pago)...');
      // Tamaño del logo: ancho máximo 60mm, altura proporcional
      const logoWidth = 60;
      const logoHeight = 20;
      // Detectar formato del base64 automáticamente
      const formato = logoBase64.startsWith('data:image/png') ? 'PNG' : 
                     logoBase64.startsWith('data:image/webp') ? 'WEBP' : 
                     logoBase64.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoBase64, formato, pageWidth / 2 - logoWidth / 2, yPos, logoWidth, logoHeight);
      console.log('[PDF] Logo agregado al header exitosamente (resumen de pago)');
      yPos += logoHeight + 10;
    } else {
      console.warn('[PDF] Logo base64 es null o undefined (resumen de pago)');
    }
  } catch (error) {
    console.error('[PDF] Error al cargar el logo en header (resumen de pago):', error);
    // Continuar sin logo en header si falla
  }

  // Encabezado con nombre del cliente
  const nombreCliente = cliente.nombre ? cliente.nombre.charAt(0).toUpperCase() + cliente.nombre.slice(1) : '';
  const titulo = nombreCliente ? `Resumen de Pago ${nombreCliente}` : 'Resumen de Pago';
  
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.text(titulo, pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 15;

  // Información del cliente
  doc.setFontSize(12);
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.setFont(undefined, 'bold');
  doc.text('Cliente:', 20, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(cliente.nombre, 50, yPos);
  
  yPos += 8;
  if (cliente.rubro) {
    doc.setFont(undefined, 'bold');
    doc.text('Rubro:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(cliente.rubro, 50, yPos);
    yPos += 8;
  }

  // Fecha del documento - usar fecha local para evitar problemas de timezone
  const ahora = new Date();
  const fechaLocal = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const fechaFormateada = fechaLocal.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });
  doc.setFont(undefined, 'bold');
  doc.text('Fecha:', 20, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(fechaFormateada, 50, yPos);
  
  yPos += 15;

  // Información de pago
  doc.setFont(undefined, 'bold');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  if (cliente.pagoUnico) {
    doc.text('Tipo de Pago: Pago Único', 20, yPos);
  } else {
    const fechaPagoTexto = cliente.pagoMesSiguiente 
      ? `Día ${cliente.fechaPago} del mes siguiente`
      : `Día ${cliente.fechaPago} de cada mes`;
    doc.text(`Fecha de Pago: ${fechaPagoTexto}`, 20, yPos);
  }
  yPos += 10;

  // Obtener servicios pendientes
  const serviciosPagados = estadoPagoMes?.serviciosPagados || {};
  let serviciosPendientes = [];
  let totalPendiente = 0;

  if (cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0) {
    // Filtrar solo servicios pendientes
    serviciosPendientes = cliente.servicios.filter((servicio, index) => {
      // Un servicio está pendiente si no está marcado como pagado
      return serviciosPagados[index] !== true;
    });
    
    // Calcular total de servicios pendientes
    totalPendiente = serviciosPendientes.reduce((sum, s) => sum + (s.precio || 0), 0);
  } else {
    // Compatibilidad con montoPago antiguo - solo mostrar si está pendiente
    const pagado = estadoPagoMes?.pagado || cliente.pagado || false;
    if (!pagado) {
      serviciosPendientes = [{ nombre: 'Servicio', precio: cliente.montoPago || 0 }];
      totalPendiente = cliente.montoPago || 0;
    }
  }

  // Si no hay servicios pendientes, mostrar mensaje
  if (serviciosPendientes.length === 0) {
    doc.setFont(undefined, 'normal');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('No hay servicios pendientes de pago.', 20, yPos);
    yPos += 10;
    
    // Línea separadora (gris claro sobre fondo azul)
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    doc.line(20, yPos, pageWidth - 20, yPos);
    yPos += 10;
    
    // Total a pagar: $0
    const totalFormateado = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(0);
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Total a Pagar:', 20, yPos);
    doc.setFontSize(16);
    doc.text(totalFormateado, pageWidth - 25, yPos, { align: 'right' });
    yPos += 15;
  } else {
    // Tabla de servicios
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Servicios Pendientes:', 20, yPos);
    yPos += 8;

    // Encabezado de tabla (azul más oscuro para contraste)
    doc.setFillColor(azulMarca[0] - 20, azulMarca[1] - 20, azulMarca[2] - 20);
    doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Descripción', 25, yPos);
    doc.text('Precio', pageWidth - 25, yPos, { align: 'right' });
    yPos += 10;

    // Servicios pendientes
    doc.setFont(undefined, 'normal');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    serviciosPendientes.forEach((servicio) => {
      // Verificar si necesitamos una nueva página
      if (yPos > pageHeight - 30) {
        doc.addPage();
        // Dibujar fondo azul en nueva página
        doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        yPos = 20;
      }

      doc.text(servicio.nombre || 'Servicio', 25, yPos);
      const precioFormateado = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0
      }).format(servicio.precio || 0);
      doc.text(precioFormateado, pageWidth - 25, yPos, { align: 'right' });
      yPos += 8;
    });

    yPos += 5;
    
    // Línea separadora (gris claro sobre fondo azul)
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    doc.line(20, yPos, pageWidth - 20, yPos);
    yPos += 10;

    // Total pendiente
    const totalFormateado = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(totalPendiente);

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Total a Pagar:', 20, yPos);
    doc.setFontSize(16);
    doc.text(totalFormateado, pageWidth - 25, yPos, { align: 'right' });
    
    yPos += 15;
  }

  // Observaciones si existen
  if (cliente.observaciones) {
    if (yPos > pageHeight - 40) {
      doc.addPage();
      // Dibujar fondo azul en nueva página
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Observaciones:', 20, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    const observaciones = doc.splitTextToSize(cliente.observaciones, pageWidth - 40);
    doc.text(observaciones, 20, yPos);
  }

  // Cargar logo para el footer una vez y reutilizarlo en todas las páginas
  // Usar logo PNG local desde la carpeta public
  let logoBase64Footer = null;
  try {
    // Intentar con diferentes variantes del nombre (case-sensitive en Linux)
    const posiblesNombres = ['/Logo.png', '/logo.png', '/LOGO.PNG'];
    console.log('[PDF] Cargando logo PNG local para footer (resumen de pago)...');
    
    for (const nombreLogo of posiblesNombres) {
      try {
        logoBase64Footer = await cargarLogoBase64(nombreLogo);
        if (logoBase64Footer) {
          console.log(`[PDF] Logo PNG local cargado exitosamente desde ${nombreLogo} (resumen de pago)`);
          break; // Si se cargó exitosamente, salir del loop
        }
      } catch (localError) {
        // Continuar con el siguiente nombre
        continue;
      }
    }
    
    // Si no se cargó con ruta relativa, intentar con URL absoluta
    if (!logoBase64Footer && typeof window !== 'undefined') {
      for (const nombreLogo of posiblesNombres) {
        try {
          const logoUrlAbsoluta = `${window.location.origin}${nombreLogo}`;
          logoBase64Footer = await cargarLogoBase64(logoUrlAbsoluta);
          if (logoBase64Footer) {
            console.log(`[PDF] Logo PNG cargado con URL absoluta exitosamente desde ${logoUrlAbsoluta} (resumen de pago)`);
            break;
          }
        } catch (absolutaError) {
          continue;
        }
      }
    }
    
    // Si aún no se cargó, intentar con URL remota como último recurso
    if (!logoBase64Footer) {
      console.warn('[PDF] Logo PNG local no encontrado, intentando con URL remota...');
      const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
      try {
        logoBase64Footer = await cargarLogoBase64(logoUrl);
        if (logoBase64Footer) {
          console.log('[PDF] Logo remoto cargado para footer exitosamente (resumen de pago)');
        }
      } catch (remoteError) {
        console.error('[PDF] Error al cargar logo remoto:', remoteError);
      }
    }
  } catch (error) {
    console.error('[PDF] Error general al cargar logo para footer (resumen de pago):', error);
  }

  // Pie de página
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // NO dibujar el fondo azul aquí porque ya está dibujado al inicio
    // Solo agregar el footer
    
    // Línea separadora del footer (gris claro sobre fondo azul)
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    
    // Logo de la empresa en el footer (siempre intentar mostrar el logo, no texto)
    if (logoBase64Footer) {
      // Obtener dimensiones manteniendo proporciones originales
      const dimensiones = await obtenerDimensionesLogo(logoBase64Footer, 20); // Ancho máximo 20mm
      const logoWidth = dimensiones.width;
      const logoHeight = dimensiones.height;
      // Posicionar más abajo para dejar espacio con la línea de arriba, pero manteniendo espacio con el texto de abajo
      const logoY = pageHeight - 20; // Espacio después de la línea (línea en -25) y antes del texto (texto en -8)
      // Detectar formato del base64 automáticamente
      const formato = logoBase64Footer.startsWith('data:image/png') ? 'PNG' : 
                     logoBase64Footer.startsWith('data:image/webp') ? 'WEBP' : 
                     logoBase64Footer.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoBase64Footer, formato, pageWidth / 2 - logoWidth / 2, logoY, logoWidth, logoHeight);
    } else {
      // Si no se pudo cargar el logo, intentar cargarlo nuevamente en esta página
      try {
        let logoBase64Retry = null;
        // Intentar con diferentes variantes del nombre (case-sensitive en Linux)
        const posiblesNombres = ['/Logo.png', '/logo.png', '/LOGO.PNG'];
        
        for (const nombreLogo of posiblesNombres) {
          try {
            logoBase64Retry = await cargarLogoBase64(nombreLogo);
            if (logoBase64Retry) break;
          } catch (localError) {
            continue;
          }
        }
        
        // Si no se cargó con ruta relativa, intentar con URL absoluta
        if (!logoBase64Retry && typeof window !== 'undefined') {
          for (const nombreLogo of posiblesNombres) {
            try {
              const logoUrlAbsoluta = `${window.location.origin}${nombreLogo}`;
              logoBase64Retry = await cargarLogoBase64(logoUrlAbsoluta);
              if (logoBase64Retry) break;
            } catch (absolutaError) {
              continue;
            }
          }
        }
        
        if (logoBase64Retry) {
          // Obtener dimensiones manteniendo proporciones originales
          const dimensiones = await obtenerDimensionesLogo(logoBase64Retry, 20); // Ancho máximo 20mm
          const logoWidth = dimensiones.width;
          const logoHeight = dimensiones.height;
          // Posicionar más arriba para dejar más espacio con el texto de abajo
          const logoY = pageHeight - 25; // Más espacio entre logo y número de página
          const formato = logoBase64Retry.startsWith('data:image/png') ? 'PNG' : 
                         logoBase64Retry.startsWith('data:image/webp') ? 'WEBP' : 
                         logoBase64Retry.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(logoBase64Retry, formato, pageWidth / 2 - logoWidth / 2, logoY, logoWidth, logoHeight);
        } else {
          // Último fallback: texto solo si realmente no se pudo cargar
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(blanco[0], blanco[1], blanco[2]);
          doc.text(
            'Digital Space',
            pageWidth / 2,
            pageHeight - 15,
            { align: 'center' }
          );
        }
      } catch (retryError) {
        console.error('[PDF] Error al reintentar cargar logo:', retryError);
        // Fallback final a texto
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(blanco[0], blanco[1], blanco[2]);
        doc.text(
          'Digital Space',
          pageWidth / 2,
          pageHeight - 15,
          { align: 'center' }
        );
      }
    }
    
    // Número de página
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Generar nombre del archivo (solo nombre del cliente, sin números, con espacios)
  const nombreClienteLimpio = cliente.nombre.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, ' ');
  const nombreArchivo = `Resumen de Pago ${nombreClienteLimpio}.pdf`;
  
  // Guardar PDF
  doc.save(nombreArchivo);
}

// Generar PDF de presupuesto
export async function generarPresupuestoPDF(presupuesto) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Color azul del header del CRM (RGB: 20, 38, 120 - #142678)
  const azulMarca = [20, 38, 120];
  const blanco = [255, 255, 255];
  const grisClaro = [200, 200, 200];
  
  // Dibujar fondo azul en toda la página
  doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  let yPos = 20;

  // Logo de la empresa en el header - cargar como base64 para asegurar que aparezca
  try {
    const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
    console.log('[PDF] Cargando logo para header (presupuesto)...');
    const logoBase64 = await cargarLogoBase64(logoUrl);
    if (logoBase64) {
      console.log('[PDF] Logo cargado, agregando al PDF (presupuesto)...');
      // Tamaño del logo: ancho máximo 60mm, altura proporcional
      const logoWidth = 60;
      const logoHeight = 20;
      // Detectar formato del base64 automáticamente
      const formato = logoBase64.startsWith('data:image/png') ? 'PNG' : 
                     logoBase64.startsWith('data:image/webp') ? 'WEBP' : 
                     logoBase64.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoBase64, formato, pageWidth / 2 - logoWidth / 2, yPos, logoWidth, logoHeight);
      console.log('[PDF] Logo agregado al header exitosamente (presupuesto)');
      yPos += logoHeight + 10;
    } else {
      console.warn('[PDF] Logo base64 es null o undefined (presupuesto)');
    }
  } catch (error) {
    console.error('[PDF] Error al cargar el logo en header (presupuesto):', error);
    // Continuar sin logo en header si falla
  }

  // Encabezado con nombre del cliente
  const nombreCliente = presupuesto.cliente?.nombre ? presupuesto.cliente.nombre.charAt(0).toUpperCase() + presupuesto.cliente.nombre.slice(1) : '';
  const titulo = nombreCliente ? `Presupuesto ${nombreCliente}` : 'Presupuesto';
  
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.text(titulo, pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 15;

  // Información del presupuesto
  doc.setFontSize(12);
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  // No mostrar número de presupuesto en el PDF
  let fechaFormateada;
  if (presupuesto.fecha) {
    // Parsear la fecha correctamente para evitar problemas de timezone
    let fechaLocal;
    if (typeof presupuesto.fecha === 'string' && presupuesto.fecha.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Si es string en formato YYYY-MM-DD, extraer componentes directamente
      const partes = presupuesto.fecha.split('-');
      const año = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1; // Los meses en JS son 0-indexed
      const dia = parseInt(partes[2], 10);
      fechaLocal = new Date(año, mes, dia);
    } else {
      // Si es un objeto Date o otro formato, usar UTC methods para extraer componentes
      const fechaPresupuesto = new Date(presupuesto.fecha);
      fechaLocal = new Date(
        fechaPresupuesto.getUTCFullYear(),
        fechaPresupuesto.getUTCMonth(),
        fechaPresupuesto.getUTCDate()
      );
    }
    fechaFormateada = fechaLocal.toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  } else {
    // Si no hay fecha, usar fecha actual local
    const ahora = new Date();
    const fechaLocal = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    fechaFormateada = fechaLocal.toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  }
  doc.setFont(undefined, 'bold');
  doc.text('Fecha:', 20, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(fechaFormateada, 50, yPos);
  
  yPos += 8;
  if (presupuesto.validez) {
    doc.setFont(undefined, 'bold');
    doc.text('Validez:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(`${presupuesto.validez} días`, 50, yPos);
    yPos += 8;
  }

  yPos += 5;

  // Información del cliente
  doc.setFont(undefined, 'bold');
  doc.text('Cliente:', 20, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(presupuesto.cliente?.nombre || 'N/A', 50, yPos);
  
  yPos += 8;
  if (presupuesto.cliente?.rubro) {
    doc.setFont(undefined, 'bold');
    doc.text('Rubro:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(presupuesto.cliente.rubro, 50, yPos);
    yPos += 8;
  }
  if (presupuesto.cliente?.ciudad) {
    doc.setFont(undefined, 'bold');
    doc.text('Ciudad:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(presupuesto.cliente.ciudad, 50, yPos);
    yPos += 8;
  }
  if (presupuesto.cliente?.email) {
    doc.setFont(undefined, 'bold');
    doc.text('Email:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(presupuesto.cliente.email, 50, yPos);
    yPos += 8;
  }
  if (presupuesto.cliente?.telefono) {
    doc.setFont(undefined, 'bold');
    doc.text('Teléfono:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(presupuesto.cliente.telefono, 50, yPos);
    yPos += 8;
  }

  yPos += 10;

  // Tabla de items
  doc.setFont(undefined, 'bold');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.text('Items:', 20, yPos);
  yPos += 8;

  // Encabezado de tabla (azul más oscuro para contraste)
  doc.setFillColor(azulMarca[0] - 20, azulMarca[1] - 20, azulMarca[2] - 20);
  doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.text('Descripción', 25, yPos);
  doc.text('Cant.', 120, yPos);
  doc.text('Precio Unit.', 140, yPos);
  doc.text('Subtotal', pageWidth - 25, yPos, { align: 'right' });
  yPos += 10;

  // Items
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  if (presupuesto.items && Array.isArray(presupuesto.items) && presupuesto.items.length > 0) {
    presupuesto.items.forEach((item) => {
      // Verificar si necesitamos una nueva página
      if (yPos > pageHeight - 30) {
        doc.addPage();
        // Dibujar fondo azul en nueva página
        doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        yPos = 20;
      }

      // Descripción (puede ser larga, dividir si es necesario)
      const descripcion = doc.splitTextToSize(item.descripcion || 'Item', pageWidth - 120);
      doc.text(descripcion, 25, yPos);
      
      const cantidad = (item.cantidad || 1).toString();
      doc.text(cantidad, 120, yPos);
      
      const precioFormateado = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0
      }).format(item.precioUnitario || 0);
      doc.text(precioFormateado, 140, yPos);
      
      const subtotalFormateado = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0
      }).format(item.subtotal || ((item.cantidad || 1) * (item.precioUnitario || 0)));
      doc.text(subtotalFormateado, pageWidth - 25, yPos, { align: 'right' });
      
      yPos += (descripcion.length * 6) + 2; // Ajustar según líneas de descripción
    });
  }

  yPos += 5;
  
  // Línea separadora (gris claro sobre fondo azul)
  doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 10;

  // Totales
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  const subtotalFormateado = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(presupuesto.subtotal || 0);
  doc.text('Subtotal:', 20, yPos);
  doc.text(subtotalFormateado, pageWidth - 25, yPos, { align: 'right' });
  yPos += 8;

  if (presupuesto.descuento > 0) {
    const descuentoFormateado = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(presupuesto.descuento);
    doc.text(`Descuento (${presupuesto.porcentajeDescuento || 0}%):`, 20, yPos);
    doc.setTextColor(255, 200, 200); // Rojo claro para descuento sobre fondo azul
    doc.text(`-${descuentoFormateado}`, pageWidth - 25, yPos, { align: 'right' });
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    yPos += 8;
  }

  const totalFormateado = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(presupuesto.total || 0);

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.text('Total:', 20, yPos);
  doc.setFontSize(16);
  doc.text(totalFormateado, pageWidth - 25, yPos, { align: 'right' });
  
  yPos += 15;

  // Observaciones si existen
  if (presupuesto.observaciones) {
    if (yPos > pageHeight - 40) {
      doc.addPage();
      // Dibujar fondo azul en nueva página
      doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      yPos = 20;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text('Observaciones:', 20, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    const observaciones = doc.splitTextToSize(presupuesto.observaciones, pageWidth - 40);
    doc.text(observaciones, 20, yPos);
    yPos += observaciones.length * 6;
  }

  // Cargar logo para el footer una vez y reutilizarlo en todas las páginas
  // Usar logo PNG local desde la carpeta public
  let logoBase64Footer = null;
  try {
    // Intentar con diferentes variantes del nombre (case-sensitive en Linux)
    const posiblesNombres = ['/Logo.png', '/logo.png', '/LOGO.PNG'];
    console.log('[PDF] Cargando logo PNG local para footer (presupuesto)...');
    
    for (const nombreLogo of posiblesNombres) {
      try {
        logoBase64Footer = await cargarLogoBase64(nombreLogo);
        if (logoBase64Footer) {
          console.log(`[PDF] Logo PNG local cargado exitosamente desde ${nombreLogo} (presupuesto)`);
          break; // Si se cargó exitosamente, salir del loop
        }
      } catch (localError) {
        // Continuar con el siguiente nombre
        continue;
      }
    }
    
    // Si no se cargó con ruta relativa, intentar con URL absoluta
    if (!logoBase64Footer && typeof window !== 'undefined') {
      for (const nombreLogo of posiblesNombres) {
        try {
          const logoUrlAbsoluta = `${window.location.origin}${nombreLogo}`;
          logoBase64Footer = await cargarLogoBase64(logoUrlAbsoluta);
          if (logoBase64Footer) {
            console.log(`[PDF] Logo PNG cargado con URL absoluta exitosamente desde ${logoUrlAbsoluta} (presupuesto)`);
            break;
          }
        } catch (absolutaError) {
          continue;
        }
      }
    }
    
    // Si aún no se cargó, intentar con URL remota como último recurso
    if (!logoBase64Footer) {
      console.warn('[PDF] Logo PNG local no encontrado, intentando con URL remota...');
      const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
      try {
        logoBase64Footer = await cargarLogoBase64(logoUrl);
        if (logoBase64Footer) {
          console.log('[PDF] Logo remoto cargado para footer exitosamente (presupuesto)');
        }
      } catch (remoteError) {
        console.error('[PDF] Error al cargar logo remoto:', remoteError);
      }
    }
  } catch (error) {
    console.error('[PDF] Error general al cargar logo para footer (presupuesto):', error);
  }

  // Pie de página
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // NO dibujar el fondo azul aquí porque ya está dibujado al inicio
    // Solo agregar el footer
    
    // Línea separadora del footer (gris claro sobre fondo azul)
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    
    // Logo de la empresa en el footer (siempre intentar mostrar el logo, no texto)
    if (logoBase64Footer) {
      // Obtener dimensiones manteniendo proporciones originales
      const dimensiones = await obtenerDimensionesLogo(logoBase64Footer, 20); // Ancho máximo 20mm
      const logoWidth = dimensiones.width;
      const logoHeight = dimensiones.height;
      // Posicionar más abajo para dejar espacio con la línea de arriba, pero manteniendo espacio con el texto de abajo
      const logoY = pageHeight - 20; // Espacio después de la línea (línea en -25) y antes del texto (texto en -8)
      // Detectar formato del base64 automáticamente
      const formato = logoBase64Footer.startsWith('data:image/png') ? 'PNG' : 
                     logoBase64Footer.startsWith('data:image/webp') ? 'WEBP' : 
                     logoBase64Footer.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoBase64Footer, formato, pageWidth / 2 - logoWidth / 2, logoY, logoWidth, logoHeight);
    } else {
      // Si no se pudo cargar el logo, intentar cargarlo nuevamente en esta página
      try {
        let logoBase64Retry = null;
        // Intentar con diferentes variantes del nombre (case-sensitive en Linux)
        const posiblesNombres = ['/Logo.png', '/logo.png', '/LOGO.PNG'];
        
        for (const nombreLogo of posiblesNombres) {
          try {
            logoBase64Retry = await cargarLogoBase64(nombreLogo);
            if (logoBase64Retry) break;
          } catch (localError) {
            continue;
          }
        }
        
        // Si no se cargó con ruta relativa, intentar con URL absoluta
        if (!logoBase64Retry && typeof window !== 'undefined') {
          for (const nombreLogo of posiblesNombres) {
            try {
              const logoUrlAbsoluta = `${window.location.origin}${nombreLogo}`;
              logoBase64Retry = await cargarLogoBase64(logoUrlAbsoluta);
              if (logoBase64Retry) break;
            } catch (absolutaError) {
              continue;
            }
          }
        }
        
        if (logoBase64Retry) {
          // Obtener dimensiones manteniendo proporciones originales
          const dimensiones = await obtenerDimensionesLogo(logoBase64Retry, 20); // Ancho máximo 20mm
          const logoWidth = dimensiones.width;
          const logoHeight = dimensiones.height;
          // Posicionar más arriba para dejar más espacio con el texto de abajo
          const logoY = pageHeight - 25; // Más espacio entre logo y número de página
          const formato = logoBase64Retry.startsWith('data:image/png') ? 'PNG' : 
                         logoBase64Retry.startsWith('data:image/webp') ? 'WEBP' : 
                         logoBase64Retry.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(logoBase64Retry, formato, pageWidth / 2 - logoWidth / 2, logoY, logoWidth, logoHeight);
        } else {
          // Último fallback: texto solo si realmente no se pudo cargar
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(blanco[0], blanco[1], blanco[2]);
          doc.text(
            'Digital Space',
            pageWidth / 2,
            pageHeight - 15,
            { align: 'center' }
          );
        }
      } catch (retryError) {
        console.error('[PDF] Error al reintentar cargar logo:', retryError);
        // Fallback final a texto
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(blanco[0], blanco[1], blanco[2]);
        doc.text(
          'Digital Space',
          pageWidth / 2,
          pageHeight - 15,
          { align: 'center' }
        );
      }
    }
    
    // Número de página
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(blanco[0], blanco[1], blanco[2]);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Generar nombre del archivo (solo nombre del cliente, sin números, con espacios)
  const nombreClienteLimpio = presupuesto.cliente?.nombre?.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, ' ') || 'Cliente';
  const nombreArchivo = `Presupuesto ${nombreClienteLimpio}.pdf`;
  
  // Guardar PDF
  doc.save(nombreArchivo);
}

// Función auxiliar para dibujar un gráfico de barras simple
function dibujarGraficoBarras(doc, x, y, width, height, data, labels, colors) {
  if (!data || data.length === 0) return;
  
  const maxValue = Math.max(...data);
  const barWidth = width / data.length - 5;
  const barSpacing = 5;
  
  // Dibujar ejes
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  // Eje Y (vertical)
  doc.line(x, y, x, y + height);
  // Eje X (horizontal)
  doc.line(x, y + height, x + width, y + height);
  
  // Dibujar barras
  data.forEach((value, index) => {
    if (value <= 0) return;
    
    const barHeight = (value / maxValue) * height;
    const barX = x + (barWidth + barSpacing) * index + barSpacing;
    const barY = y + height - barHeight;
    
    // Color de la barra
    const color = colors && colors[index] ? colors[index] : [20, 38, 120];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(barX, barY, barWidth, barHeight, 'F');
    
    // Valor encima de la barra
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(
      value.toLocaleString('es-AR', { maximumFractionDigits: 0 }),
      barX + barWidth / 2,
      barY - 2,
      { align: 'center' }
    );
    
    // Etiqueta debajo del eje
    if (labels && labels[index]) {
      doc.setFontSize(7);
      doc.text(
        labels[index].substring(0, 10),
        barX + barWidth / 2,
        y + height + 5,
        { align: 'center' }
      );
    }
  });
}

// Función auxiliar para dibujar un gráfico de pastel simple
function dibujarGraficoPie(doc, x, y, radius, data, labels, colors) {
  if (!data || data.length === 0) return;
  
  const total = data.reduce((sum, val) => sum + val, 0);
  if (total === 0) return;
  
  let currentAngle = -90; // Empezar desde arriba
  const startX = x + radius;
  const startY = y + radius;
  
  data.forEach((value, index) => {
    const percentage = value / total;
    const angle = (percentage * 360);
    
    // Color de la porción
    const color = colors && colors[index] ? colors[index] : [20, 38, 120];
    doc.setFillColor(color[0], color[1], color[2]);
    
    // Dibujar arco de pastel (usando polígono aproximado)
    const segments = Math.max(8, Math.ceil(angle / 5));
    const points = [];
    points.push([startX, startY]);
    
    for (let i = 0; i <= segments; i++) {
      const segAngle = currentAngle + (angle * i / segments);
      const rad = (segAngle * Math.PI) / 180;
      const px = startX + radius * Math.cos(rad);
      const py = startY + radius * Math.sin(rad);
      points.push([px, py]);
    }
    
    // Dibujar polígono
    if (points.length > 2) {
      doc.path(points, 'F');
    }
    
    // Etiqueta fuera del gráfico
    if (labels && labels[index]) {
      const labelAngle = currentAngle + angle / 2;
      const labelRad = (labelAngle * Math.PI) / 180;
      const labelX = startX + (radius + 15) * Math.cos(labelRad);
      const labelY = startY + (radius + 15) * Math.sin(labelRad);
      
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text(
        `${labels[index]}: ${(percentage * 100).toFixed(1)}%`,
        labelX,
        labelY,
        { align: 'center' }
      );
    }
    
    currentAngle += angle;
  });
}

// Generar PDF de informe con gráficos
export async function generarInformePDF(informe, totals) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Color azul del header del CRM (RGB: 20, 38, 120 - #142678)
  const azulMarca = [20, 38, 120];
  const blanco = [255, 255, 255];
  const grisClaro = [200, 200, 200];
  const coloresGraficos = [
    [20, 38, 120],   // Azul marca
    [59, 130, 246],  // Azul claro
    [16, 185, 129],  // Verde
    [245, 158, 11],  // Amarillo
    [239, 68, 68],   // Rojo
    [139, 92, 246]   // Púrpura
  ];
  
  let yPos = 20;
  
  // Header con fondo azul
  doc.setFillColor(azulMarca[0], azulMarca[1], azulMarca[2]);
  doc.rect(0, 0, pageWidth, 50, 'F');
  
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
      doc.addImage(logoBase64, formato, pageWidth / 2 - logoWidth / 2, 10, logoWidth, logoHeight);
    }
  } catch (error) {
    console.error('[PDF] Error al cargar logo:', error);
  }
  
  // Título del informe
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(blanco[0], blanco[1], blanco[2]);
  doc.text(informe.titulo || 'Informe', pageWidth / 2, 45, { align: 'center' });
  
  yPos = 60;
  
  // Información del cliente y período
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.setFont(undefined, 'bold');
  doc.text('Cliente:', 20, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(informe.clienteNombre || 'N/A', 50, yPos);
  
  yPos += 7;
  if (informe.clienteEmail) {
    doc.setFont(undefined, 'bold');
    doc.text('Email:', 20, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(informe.clienteEmail, 50, yPos);
    yPos += 7;
  }
  
  doc.setFont(undefined, 'bold');
  doc.text('Período:', 20, yPos);
  doc.setFont(undefined, 'normal');
  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const periodoTexto = informe.periodo 
    ? `${formatearFecha(informe.periodo.from)} - ${formatearFecha(informe.periodo.to)}`
    : 'N/A';
  doc.text(periodoTexto, 50, yPos);
  
  yPos += 10;
  
  // Línea separadora
  doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 10;
  
  // KPIs principales
  if (totals && totals.totalsGlobal) {
    const tg = totals.totalsGlobal;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Resumen Ejecutivo', 20, yPos);
    yPos += 8;
    
    const formatearMoneda = (monto) => {
      if (monto === null || monto === undefined || isNaN(monto)) return '0';
      return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: informe.moneda || 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(monto);
    };
    
    const formatearNumero = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0';
      return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(num);
    };
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    
    // Grid de KPIs
    const kpiY = yPos;
    let kpiX = 20;
    
    doc.setFont(undefined, 'bold');
    doc.text('Spend Total:', kpiX, kpiY);
    doc.setFont(undefined, 'normal');
    doc.text(formatearMoneda(tg.spend || 0), kpiX + 35, kpiY);
    
    if (tg.impressions > 0) {
      kpiX = 110;
      doc.setFont(undefined, 'bold');
      doc.text('Impresiones:', kpiX, kpiY);
      doc.setFont(undefined, 'normal');
      doc.text(formatearNumero(tg.impressions || 0), kpiX + 30, kpiY);
    }
    
    if (tg.clicks > 0) {
      yPos += 7;
      kpiX = 20;
      doc.setFont(undefined, 'bold');
      doc.text('Clicks:', kpiX, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(formatearNumero(tg.clicks || 0), kpiX + 20, yPos);
    }
    
    if (tg.conversions > 0) {
      kpiX = 110;
      doc.setFont(undefined, 'bold');
      doc.text('Conversiones:', kpiX, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(formatearNumero(tg.conversions || 0), kpiX + 30, yPos);
    }
    
    yPos += 10;
    
    // Métricas derivadas
    if (tg.ctr !== undefined && tg.ctr > 0) {
      doc.setFont(undefined, 'bold');
      doc.text('CTR:', 20, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(`${tg.ctr.toFixed(2)}%`, 40, yPos);
    }
    
    if (tg.cpc !== undefined && tg.cpc > 0) {
      doc.setFont(undefined, 'bold');
      doc.text('CPC:', 110, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(formatearMoneda(tg.cpc), 130, yPos);
    }
    
    yPos += 10;
  }
  
  // Gráfico de barras: Spend por plataforma
  if (totals && totals.totalsByPlatform) {
    const platforms = Object.keys(totals.totalsByPlatform);
    if (platforms.length > 0) {
      // Verificar si necesitamos nueva página
      if (yPos > pageHeight - 80) {
        doc.addPage();
        yPos = 20;
      }
      
      yPos += 5;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Spend por Plataforma', 20, yPos);
      yPos += 10;
      
      const spendData = platforms.map(p => totals.totalsByPlatform[p].spend || 0);
      const platformLabels = platforms.map(p => {
        const nombres = { meta: 'Meta Ads', google: 'Google Ads', otro: 'Otro' };
        return nombres[p] || p;
      });
      
      dibujarGraficoBarras(
        doc,
        20,
        yPos,
        pageWidth - 40,
        50,
        spendData,
        platformLabels,
        coloresGraficos
      );
      
      yPos += 65;
    }
  }
  
  // Gráfico de pastel: Distribución de plataformas
  if (totals && totals.totalsByPlatform) {
    const platforms = Object.keys(totals.totalsByPlatform);
    if (platforms.length > 0) {
      if (yPos > pageHeight - 80) {
        doc.addPage();
        yPos = 20;
      }
      
      yPos += 5;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Distribución por Plataforma', 20, yPos);
      yPos += 10;
      
      const spendData = platforms.map(p => totals.totalsByPlatform[p].spend || 0);
      const platformLabels = platforms.map(p => {
        const nombres = { meta: 'Meta Ads', google: 'Google Ads', otro: 'Otro' };
        return nombres[p] || p;
      });
      
      dibujarGraficoPie(
        doc,
        60,
        yPos,
        30,
        spendData,
        platformLabels,
        coloresGraficos
      );
      
      yPos += 70;
    }
  }
  
  // Funciones auxiliares para formatear métricas (similares a la interfaz)
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
      frequency: 'Frecuencia',
      objective: 'Objetivo'
    };
    return labels[key] || key;
  };

  const isCurrencyMetric = (key) => {
    const currencyMetrics = ['spend', 'cpc', 'cpa', 'costPerConversation', 'cpm'];
    const currencyKeywords = ['costo', 'cost', 'precio', 'price', 'gasto', 'spend', 'revenue', 'ingreso'];
    return currencyMetrics.includes(key) || 
           currencyKeywords.some(keyword => key.toLowerCase().includes(keyword));
  };

  const isPercentageMetric = (key) => {
    return key === 'ctr' || key.toLowerCase().includes('porcentaje') || key.toLowerCase().includes('percentage');
  };

  const formatearMonedaMetric = (monto, moneda = 'ARS') => {
    if (monto === null || monto === undefined || isNaN(monto)) return '-';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(monto);
  };

  const formatearNumeroMetric = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    const number = Number(num);
    const isInteger = number % 1 === 0;
    if (isInteger) {
      return number.toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
    return number.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  const formatMetricValue = (key, value, moneda = 'ARS') => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    if (isPercentageMetric(key)) {
      const num = Number(value);
      const isInteger = num % 1 === 0;
      return `${num.toFixed(isInteger ? 0 : 2)}%`;
    }
    if (isCurrencyMetric(key)) {
      return formatearMonedaMetric(value, moneda);
    }
    return formatearNumeroMetric(value);
  };

  const getPlataformaNombre = (platform) => {
    const nombres = {
      meta: 'Meta Ads',
      google: 'Google Ads',
      otro: 'Otro'
    };
    return nombres[platform] || platform;
  };

  // Campañas con contenedores (igual que en el resumen del CRM)
  if (informe.sections && informe.sections.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }
    
    yPos += 5;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Campañas', 20, yPos);
    yPos += 10;
    
    informe.sections.forEach((section, sIdx) => {
      if (section.items && section.items.length > 0) {
        // Contenedor de sección (bg-slate-800 border border-slate-700 rounded-lg p-6)
        let sectionStartY = yPos;
        let sectionContentHeight = 15; // Título inicial
        
        // Calcular altura necesaria antes de dibujar
        let tempY = yPos + 15;
        section.items.forEach((item) => {
          tempY += 10; // Nombre campaña
          if (item.objective) tempY += 6;
          let metrics = item.metrics || {};
          if (metrics instanceof Map) {
            metrics = Object.fromEntries(metrics);
          }
          const metricCount = Object.keys(metrics).length;
          if (metricCount > 0) {
            const rows = Math.ceil(metricCount / 4); // 4 columnas
            tempY += rows * 12 + 8;
          }
          tempY += 10; // Espacio entre campañas
        });
        sectionContentHeight = tempY - yPos + 10;
        
        // Verificar si necesitamos nueva página
        if (yPos + sectionContentHeight > pageHeight - 40) {
          doc.addPage();
          yPos = 20;
          sectionStartY = yPos;
        }
        
        // Dibujar contenedor de sección (fondo gris claro con borde)
        const sectionPadding = 6;
        const sectionMarginX = 20;
        const sectionWidth = pageWidth - (sectionMarginX * 2);
        doc.setFillColor(240, 240, 240); // Gris claro (simulando bg-slate-800)
        doc.setDrawColor(200, 200, 200); // Borde (simulando border-slate-700)
        doc.setLineWidth(0.5);
        doc.rect(sectionMarginX, yPos, sectionWidth, sectionContentHeight, 'FD'); // 'FD' = Fill + Draw
        
        yPos += sectionPadding;
        
        // Título de la sección (text-md font-semibold text-slate-200)
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        const platformName = getPlataformaNombre(section.platform);
        const sectionTitle = section.name ? `${platformName} - ${section.name}` : platformName;
        doc.text(sectionTitle, sectionMarginX + sectionPadding, yPos);
        yPos += 8;
        
        // Espacio para items (space-y-4)
        const itemsStartY = yPos;
        
        section.items.forEach((item, iIdx) => {
          // Calcular altura de esta campaña
          let campaignHeight = 10; // Nombre
          if (item.objective) campaignHeight += 6;
          let metrics = item.metrics || {};
          if (metrics instanceof Map) {
            metrics = Object.fromEntries(metrics);
          }
          const metricCount = Object.keys(metrics).length;
          if (metricCount > 0) {
            const rows = Math.ceil(metricCount / 4);
            campaignHeight += rows * 12;
          }
          campaignHeight += 8; // Padding bottom
          
          // Verificar si necesitamos nueva página para esta campaña
          if (yPos + campaignHeight > pageHeight - 40) {
            doc.addPage();
            yPos = 20;
          }
          
          // Contenedor de campaña (bg-slate-900/50 border border-slate-700 rounded-lg p-4)
          const campaignMarginX = sectionMarginX + sectionPadding + 4;
          const campaignWidth = sectionWidth - (sectionPadding * 2) - 8;
          const campaignPadding = 4;
          const campaignStartY = yPos;
          
          // Dibujar contenedor de campaña (fondo gris más oscuro con borde)
          doc.setFillColor(230, 230, 230); // Gris más oscuro (simulando bg-slate-900/50)
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.5);
          doc.rect(campaignMarginX, yPos, campaignWidth, campaignHeight, 'FD');
          
          yPos += campaignPadding;
          
          // Nombre de la campaña (font-medium text-slate-200 mb-2)
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(item.campaignName || 'Campaña sin nombre', campaignMarginX + campaignPadding, yPos);
          yPos += 6;
          
          // Objetivo si existe (text-sm text-slate-400 mb-3)
          if (item.objective) {
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(120, 120, 120);
            doc.text(`Objetivo: ${item.objective}`, campaignMarginX + campaignPadding, yPos);
            yPos += 6;
          }
          
          // Métricas en grid (grid grid-cols-2 md:grid-cols-4 gap-3)
          const metricsObj = metrics;
          const metricEntries = Object.entries(metricsObj);
          
          if (metricEntries.length > 0) {
            const metricsStartY = yPos;
            const metricsMarginX = campaignMarginX + campaignPadding;
            const metricsWidth = campaignWidth - (campaignPadding * 2);
            const colCount = 4; // grid-cols-4 (desktop)
            const colWidth = (metricsWidth - (3 * 3)) / colCount; // 3 gaps de 3mm
            const rowHeight = 10; // Altura por fila
            
            metricEntries.forEach(([key, value], idx) => {
              const col = idx % colCount;
              const row = Math.floor(idx / colCount);
              const metricX = metricsMarginX + (col * (colWidth + 3));
              const metricY = metricsStartY + (row * rowHeight);
              
              // Label (text-xs text-slate-400)
              doc.setFontSize(7);
              doc.setFont(undefined, 'normal');
              doc.setTextColor(120, 120, 120);
              doc.text(getMetricLabel(key), metricX, metricY);
              
              // Valor (text-sm font-medium text-slate-200)
              doc.setFontSize(8);
              doc.setFont(undefined, 'normal');
              doc.setTextColor(0, 0, 0);
              const formattedValue = formatMetricValue(key, value, informe.moneda);
              doc.text(formattedValue, metricX, metricY + 5);
            });
            
            const rows = Math.ceil(metricEntries.length / colCount);
            yPos = metricsStartY + (rows * rowHeight);
          }
          
          yPos += campaignPadding;
          
          // Espacio entre campañas (space-y-4)
          yPos += 8;
        });
        
        yPos += sectionPadding;
      }
    });
  }
  
  // Notas y recomendaciones
  if (informe.reportNotes) {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }
    
    yPos += 5;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    
    if (informe.reportNotes.observaciones) {
      doc.text('Observaciones', 20, yPos);
      yPos += 8;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const observaciones = doc.splitTextToSize(informe.reportNotes.observaciones, pageWidth - 40);
      doc.text(observaciones, 20, yPos);
      yPos += observaciones.length * 5 + 5;
    }
    
    if (informe.reportNotes.recomendaciones) {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Recomendaciones', 20, yPos);
      yPos += 8;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const recomendaciones = doc.splitTextToSize(informe.reportNotes.recomendaciones, pageWidth - 40);
      doc.text(recomendaciones, 20, yPos);
    }
  }
  
  // Footer en todas las páginas
  const totalPages = doc.internal.pages.length - 1;
  let logoBase64Footer = null;
  
  try {
    const posiblesNombres = ['/Logo.png', '/logo.png', '/LOGO.PNG'];
    for (const nombreLogo of posiblesNombres) {
      try {
        logoBase64Footer = await cargarLogoBase64(nombreLogo);
        if (logoBase64Footer) break;
      } catch (e) {
        continue;
      }
    }
    
    if (!logoBase64Footer) {
      const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
      try {
        logoBase64Footer = await cargarLogoBase64(logoUrl);
      } catch (e) {
        console.error('[PDF] Error al cargar logo footer:', e);
      }
    }
  } catch (error) {
    console.error('[PDF] Error general al cargar logo footer:', error);
  }
  
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Línea separadora
    doc.setDrawColor(grisClaro[0], grisClaro[1], grisClaro[2]);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    
    // Logo footer
    if (logoBase64Footer) {
      try {
        const dimensiones = await obtenerDimensionesLogo(logoBase64Footer, 20);
        const formato = logoBase64Footer.startsWith('data:image/png') ? 'PNG' : 
                       logoBase64Footer.startsWith('data:image/webp') ? 'WEBP' : 
                       logoBase64Footer.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(
          logoBase64Footer,
          formato,
          pageWidth / 2 - dimensiones.width / 2,
          pageHeight - 20,
          dimensiones.width,
          dimensiones.height
        );
      } catch (e) {
        console.error('[PDF] Error al agregar logo footer:', e);
      }
    }
    
    // Número de página
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }
  
  // Devolver el PDF como blob/buffer para el servidor
  return doc.output('arraybuffer');
}