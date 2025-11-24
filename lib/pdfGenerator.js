import jsPDF from 'jspdf';

export function generarResumenPagoPDF(cliente, estadoPagoMes = null) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;

  // Encabezado
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Resumen de Pago', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 15;

  // Información del cliente
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
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
    doc.setTextColor(100, 100, 100);
    doc.text('No hay servicios pendientes de pago.', 20, yPos);
    yPos += 10;
    
    // Línea separadora
    doc.setDrawColor(200, 200, 200);
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
    doc.text('Total a Pagar:', 20, yPos);
    doc.setFontSize(16);
    doc.text(totalFormateado, pageWidth - 25, yPos, { align: 'right' });
    yPos += 15;
  } else {
    // Tabla de servicios
    doc.setFont(undefined, 'bold');
    doc.text('Servicios Pendientes:', 20, yPos);
    yPos += 8;

    // Encabezado de tabla
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');
    doc.setFont(undefined, 'bold');
    doc.text('Descripción', 25, yPos);
    doc.text('Precio', pageWidth - 25, yPos, { align: 'right' });
    yPos += 10;

    // Servicios pendientes
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    serviciosPendientes.forEach((servicio) => {
      // Verificar si necesitamos una nueva página
      if (yPos > pageHeight - 30) {
        doc.addPage();
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
    
    // Línea separadora
    doc.setDrawColor(200, 200, 200);
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
    doc.text('Total a Pagar:', 20, yPos);
    doc.setFontSize(16);
    doc.text(totalFormateado, pageWidth - 25, yPos, { align: 'right' });
    
    yPos += 15;
  }

  // Observaciones si existen
  if (cliente.observaciones) {
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Observaciones:', 20, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    const observaciones = doc.splitTextToSize(cliente.observaciones, pageWidth - 40);
    doc.text(observaciones, 20, yPos);
  }

  // Pie de página
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Línea separadora del footer
    doc.setDrawColor(200, 200, 200);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    
    // Nombre de la empresa
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(
      'Digital Space',
      pageWidth / 2,
      pageHeight - 15,
      { align: 'center' }
    );
    
    // Número de página
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Generar nombre del archivo
  const nombreArchivo = `Resumen_Pago_${cliente.nombre.replace(/[^a-z0-9]/gi, '_')}_${fechaActual.getFullYear()}${String(fechaActual.getMonth() + 1).padStart(2, '0')}.pdf`;
  
  // Guardar PDF
  doc.save(nombreArchivo);
}

// Generar PDF de presupuesto
export function generarPresupuestoPDF(presupuesto) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;

  // Encabezado
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Presupuesto', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 15;

  // Información del presupuesto
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
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
  doc.text('Items:', 20, yPos);
  yPos += 8;

  // Encabezado de tabla
  doc.setFillColor(240, 240, 240);
  doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text('Descripción', 25, yPos);
  doc.text('Cant.', 120, yPos);
  doc.text('Precio Unit.', 140, yPos);
  doc.text('Subtotal', pageWidth - 25, yPos, { align: 'right' });
  yPos += 10;

  // Items
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  if (presupuesto.items && Array.isArray(presupuesto.items) && presupuesto.items.length > 0) {
    presupuesto.items.forEach((item) => {
      // Verificar si necesitamos una nueva página
      if (yPos > pageHeight - 30) {
        doc.addPage();
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
  
  // Línea separadora
  doc.setDrawColor(200, 200, 200);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 10;

  // Totales
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
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
    doc.setTextColor(200, 0, 0);
    doc.text(`-${descuentoFormateado}`, pageWidth - 25, yPos, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    yPos += 8;
  }

  const totalFormateado = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(presupuesto.total || 0);

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Total:', 20, yPos);
  doc.setFontSize(16);
  doc.text(totalFormateado, pageWidth - 25, yPos, { align: 'right' });
  
  yPos += 15;

  // Observaciones si existen
  if (presupuesto.observaciones) {
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Observaciones:', 20, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    const observaciones = doc.splitTextToSize(presupuesto.observaciones, pageWidth - 40);
    doc.text(observaciones, 20, yPos);
    yPos += observaciones.length * 6;
  }

  // Pie de página
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Línea separadora del footer
    doc.setDrawColor(200, 200, 200);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    
    // Nombre de la empresa
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(
      'Digital Space',
      pageWidth / 2,
      pageHeight - 15,
      { align: 'center' }
    );
    
    // Número de página
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Generar nombre del archivo
  const fechaActual = new Date();
  const nombreArchivo = `Presupuesto_${presupuesto.numero}_${presupuesto.cliente?.nombre?.replace(/[^a-z0-9]/gi, '_') || 'Cliente'}_${fechaActual.getFullYear()}${String(fechaActual.getMonth() + 1).padStart(2, '0')}.pdf`;
  
  // Guardar PDF
  doc.save(nombreArchivo);
}
