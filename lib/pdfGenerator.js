import jsPDF from 'jspdf';

export function generarResumenPagoPDF(cliente) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;

  // Encabezado
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0); // Negro
  doc.text('Digital Space', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 10;
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(100, 100, 100);
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

  // Tabla de servicios
  doc.setFont(undefined, 'bold');
  doc.text('Servicios:', 20, yPos);
  yPos += 8;

  // Encabezado de tabla
  doc.setFillColor(240, 240, 240);
  doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');
  doc.setFont(undefined, 'bold');
  doc.text('Descripción', 25, yPos);
  doc.text('Precio', pageWidth - 25, yPos, { align: 'right' });
  yPos += 10;

  // Servicios
  doc.setFont(undefined, 'normal');
  if (cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0) {
    cliente.servicios.forEach((servicio, index) => {
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
      }).format(servicio.precio);
      doc.text(precioFormateado, pageWidth - 25, yPos, { align: 'right' });
      yPos += 8;
    });
  } else {
    // Compatibilidad con montoPago antiguo
    doc.text('Servicio', 25, yPos);
    const precioFormateado = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(cliente.montoPago || 0);
    doc.text(precioFormateado, pageWidth - 25, yPos, { align: 'right' });
    yPos += 8;
  }

  yPos += 5;
  
  // Línea separadora
  doc.setDrawColor(200, 200, 200);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 10;

  // Total
  const total = cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0
    ? cliente.servicios.reduce((sum, s) => sum + (s.precio || 0), 0)
    : (cliente.montoPago || 0);
  
  const totalFormateado = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(total);

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Total a Pagar:', 20, yPos);
  doc.setFontSize(16);
  doc.text(totalFormateado, pageWidth - 25, yPos, { align: 'right' });
  
  yPos += 15;

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
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Generar nombre del archivo
  const nombreArchivo = `Resumen_Pago_${cliente.nombre.replace(/[^a-z0-9]/gi, '_')}_${fechaActual.getFullYear()}${String(fechaActual.getMonth() + 1).padStart(2, '0')}.pdf`;
  
  // Guardar PDF
  doc.save(nombreArchivo);
}
