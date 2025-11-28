// Utilidades para gestionar gastos usando la API de MongoDB

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener todos los gastos de un mes específico
export async function getGastosMes(mes, año) {
  try {
    const periodo = getMesKey(mes, año);
    // Agregar timestamp para evitar caché del navegador
    const timestamp = Date.now();
    const response = await fetch(`/api/gastos?periodo=${periodo}&_t=${timestamp}`, {
      cache: 'no-store', // Sin caché para datos siempre frescos
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    const data = await response.json();
    
    if (data.success) {
      return data.data.map(gasto => ({
        id: gasto._id.toString(),
        crmId: gasto.crmId,
        descripcion: gasto.descripcion,
        monto: gasto.monto,
        fecha: gasto.fecha,
        categoria: gasto.categoria,
        fechaCreacion: gasto.fechaCreacion
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al leer gastos:', error);
    return [];
  }
}

// Agregar un nuevo gasto
export async function agregarGasto(gasto) {
  try {
    // Asegurar que la fecha se parsea correctamente
    let fecha;
    if (gasto.fecha) {
      // Si es un string en formato YYYY-MM-DD, parsearlo correctamente
      if (typeof gasto.fecha === 'string' && gasto.fecha.includes('-')) {
        const [año, mes, dia] = gasto.fecha.split('-').map(Number);
        fecha = new Date(año, mes - 1, dia); // mes - 1 porque Date usa 0-11
      } else {
        fecha = new Date(gasto.fecha);
      }
    } else {
      fecha = new Date();
    }
    
    // Validar que la fecha sea válida
    if (isNaN(fecha.getTime())) {
      console.error('Fecha inválida:', gasto.fecha);
      fecha = new Date();
    }
    
    let mes = fecha.getMonth();
    let año = fecha.getFullYear();
    
    // Validar que mes y año sean válidos, si no, usar fecha actual
    if (isNaN(mes) || isNaN(año) || mes < 0 || mes > 11 || año < 2000 || año > 2100) {
      console.error('Fecha inválida calculada, usando fecha actual:', { mes, año, fechaOriginal: gasto.fecha });
      const fechaActual = new Date();
      mes = fechaActual.getMonth();
      año = fechaActual.getFullYear();
      fecha = fechaActual;
    }
    
    // Calcular periodo (siempre debe existir después de las validaciones)
    const periodoFinal = getMesKey(mes, año);
    
    // Validar que periodo sea un string válido
    if (!periodoFinal || typeof periodoFinal !== 'string' || periodoFinal.length < 7) {
      console.error('Periodo inválido:', { periodo: periodoFinal, mes, año });
      return false;
    }
    
    // Validar que todos los campos requeridos estén presentes
    if (!gasto.descripcion || gasto.monto === undefined || gasto.monto === null) {
      console.error('Campos faltantes:', { periodo: periodoFinal, descripcion: gasto.descripcion, monto: gasto.monto });
      return false;
    }
    
    const gastoData = {
      periodo: String(periodoFinal), // Asegurar que sea string
      descripcion: String(gasto.descripcion || '').trim(),
      monto: parseFloat(gasto.monto) || 0,
      fecha: fecha.toISOString(), // Convertir a string ISO para evitar problemas de serialización
      categoria: gasto.categoria ? String(gasto.categoria).trim() : '',
      fechaCreacion: new Date().toISOString()
    };
    
    // Validación final antes de enviar
    if (!gastoData.periodo || gastoData.periodo.length < 7 || !gastoData.descripcion || gastoData.monto <= 0) {
      console.error('Datos inválidos antes de enviar:', gastoData);
      return false;
    }
    
    console.log('Enviando gasto:', gastoData);
    
    const jsonBody = JSON.stringify(gastoData);
    console.log('JSON stringificado:', jsonBody);
    console.log('Longitud del JSON:', jsonBody.length);
    console.log('Tipo de body:', typeof jsonBody);
    
    // Verificar que el JSON sea válido
    try {
      JSON.parse(jsonBody);
      console.log('JSON válido ✓');
    } catch (e) {
      console.error('JSON inválido:', e);
      return false;
    }
    
    // Crear el request de manera explícita
    const fetchOptions = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: jsonBody,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'follow'
    };
    
    console.log('Opciones de fetch:', {
      method: fetchOptions.method,
      headers: fetchOptions.headers,
      bodyLength: fetchOptions.body.length,
      hasBody: !!fetchOptions.body
    });
    
    const response = await fetch('/api/gastos', fetchOptions);
    
    // Log para debugging
    console.log('Respuesta del servidor:', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });
    
    // Si el status es 201 (Created) o response.ok es true, el gasto se creó exitosamente
    // response.ok es true para status 200-299, así que status 201 también lo es
    if (response.status === 201 || response.ok) {
      // Intentar parsear la respuesta para verificar success, pero no es crítico
      try {
        const data = await response.json();
        console.log('Datos parseados:', data);
        // Si tiene success: true, perfecto. Si no, pero el status es 201, también es OK
        if (data && data.success === true) {
          console.log('Gasto agregado exitosamente (success: true)');
          return true;
        }
        // Si el status es 201, considerar exitoso aunque success no sea true
        if (response.status === 201) {
          console.log('Gasto agregado exitosamente (status 201)');
          return true;
        }
      } catch (parseError) {
        // Si no podemos parsear, no importa. El status 201 indica éxito
        console.log('No se pudo parsear respuesta, pero status es exitoso:', response.status);
        if (response.status === 201 || response.ok) {
          return true;
        }
      }
      // Si llegamos aquí y el status es 201 o response.ok, retornar true
      console.log('Gasto agregado exitosamente (response.ok)');
      return true;
    }
    
    // Si llegamos aquí, hubo un error HTTP
    // Intentar leer el error para logging
    let errorText = 'No se pudo leer el error';
    try {
      errorText = await response.text();
    } catch (e) {
      // Ignorar error al leer el texto
    }
    
    console.error('Error al agregar gasto:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      error: errorText
    });
    return false;
  } catch (error) {
    console.error('Error al guardar gasto:', error);
    return false;
  }
}

// Eliminar un gasto
export async function eliminarGasto(gastoId, mes, año) {
  try {
    const response = await fetch(`/api/gastos/${gastoId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al eliminar gasto:', error);
    return false;
  }
}

// Obtener meses con registros de gastos
export async function getMesesConGastos() {
  try {
    const response = await fetch('/api/gastos');
    const data = await response.json();
    
    if (data.success) {
      const meses = [...new Set(data.data.map(g => g.periodo))];
      return meses.filter(m => m).sort().reverse();
    }
    return [];
  } catch (error) {
    console.error('Error al leer meses con gastos:', error);
    return [];
  }
}
