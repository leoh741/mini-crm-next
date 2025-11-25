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

export async function generarResumenPagoPDF(cliente, estadoPagoMes = null) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Color azul de la marca (RGB: 30, 58, 138 - azul oscuro)
  const azulMarca = [30, 58, 138];
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

  // Fecha del documento
  const fechaActual = new Date();
  const fechaFormateada = fechaActual.toLocaleDateString('es-ES', { 
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
  let logoBase64Footer = null;
  try {
    const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
    console.log('[PDF] Cargando logo para footer (resumen de pago)...');
    logoBase64Footer = await cargarLogoBase64(logoUrl);
    if (logoBase64Footer) {
      console.log('[PDF] Logo cargado para footer exitosamente (resumen de pago)');
    } else {
      console.warn('[PDF] Logo base64 para footer es null o undefined (resumen de pago)');
    }
  } catch (error) {
    console.error('[PDF] Error al cargar logo para footer (resumen de pago):', error);
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
    
    // Logo de la empresa en el footer
    if (logoBase64Footer) {
      // Tamaño del logo en el footer: más pequeño que en el header
      const logoWidth = 50;
      const logoHeight = 15;
      const logoY = pageHeight - 20;
      // Detectar formato del base64 automáticamente
      const formato = logoBase64Footer.startsWith('data:image/png') ? 'PNG' : 
                     logoBase64Footer.startsWith('data:image/webp') ? 'WEBP' : 
                     logoBase64Footer.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoBase64Footer, formato, pageWidth / 2 - logoWidth / 2, logoY, logoWidth, logoHeight);
    } else {
      // Fallback a texto solo si realmente no se pudo cargar
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
  
  // Color azul de la marca (RGB: 30, 58, 138 - azul oscuro)
  const azulMarca = [30, 58, 138];
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
  const fechaPresupuesto = presupuesto.fecha ? new Date(presupuesto.fecha) : new Date();
  const fechaFormateada = fechaPresupuesto.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });
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
  let logoBase64Footer = null;
  try {
    const logoUrl = 'https://digitalspace.com.ar/wp-content/uploads/2025/01/Recurso-1.webp';
    console.log('[PDF] Cargando logo para footer (presupuesto)...');
    logoBase64Footer = await cargarLogoBase64(logoUrl);
    if (logoBase64Footer) {
      console.log('[PDF] Logo cargado para footer exitosamente (presupuesto)');
    } else {
      console.warn('[PDF] Logo base64 para footer es null o undefined (presupuesto)');
    }
  } catch (error) {
    console.error('[PDF] Error al cargar logo para footer (presupuesto):', error);
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
    
    // Logo de la empresa en el footer
    if (logoBase64Footer) {
      // Tamaño del logo en el footer: más pequeño que en el header
      const logoWidth = 50;
      const logoHeight = 15;
      const logoY = pageHeight - 20;
      // Detectar formato del base64 automáticamente
      const formato = logoBase64Footer.startsWith('data:image/png') ? 'PNG' : 
                     logoBase64Footer.startsWith('data:image/webp') ? 'WEBP' : 
                     logoBase64Footer.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoBase64Footer, formato, pageWidth / 2 - logoWidth / 2, logoY, logoWidth, logoHeight);
    } else {
      // Fallback a texto solo si realmente no se pudo cargar
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
