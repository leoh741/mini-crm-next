// Utilidades para gestionar ingresos usando la API de MongoDB

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener todos los ingresos manuales de un mes específico
export async function getIngresosMes(mes, año) {
  try {
    const periodo = getMesKey(mes, año);
    // Agregar timestamp para evitar caché del navegador
    const timestamp = Date.now();
    const response = await fetch(`/api/ingresos?periodo=${periodo}&_t=${timestamp}`, {
      cache: 'no-store', // Sin caché para datos siempre frescos
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    const data = await response.json();
    
    if (data.success) {
      return data.data.map(ingreso => ({
        id: ingreso._id.toString(),
        crmId: ingreso.crmId,
        descripcion: ingreso.descripcion,
        monto: ingreso.monto,
        fecha: ingreso.fecha,
        categoria: ingreso.categoria,
        fechaCreacion: ingreso.fechaCreacion
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al leer ingresos:', error);
    return [];
  }
}

// Agregar un nuevo ingreso manual
export async function agregarIngreso(ingreso) {
  try {
    // Asegurar que la fecha se parsea correctamente
    let fecha;
    if (ingreso.fecha) {
      // Si es un string en formato YYYY-MM-DD, parsearlo correctamente
      if (typeof ingreso.fecha === 'string' && ingreso.fecha.includes('-')) {
        const [año, mes, dia] = ingreso.fecha.split('-').map(Number);
        fecha = new Date(año, mes - 1, dia); // mes - 1 porque Date usa 0-11
      } else {
        fecha = new Date(ingreso.fecha);
      }
    } else {
      fecha = new Date();
    }
    
    // Validar que la fecha sea válida
    if (isNaN(fecha.getTime())) {
      console.error('Fecha inválida:', ingreso.fecha);
      fecha = new Date();
    }
    
    const mes = fecha.getMonth();
    const año = fecha.getFullYear();
    
    // Validar que mes y año sean válidos
    if (isNaN(mes) || isNaN(año) || mes < 0 || mes > 11 || año < 2000 || año > 2100) {
      console.error('Fecha inválida calculada:', { mes, año, fechaOriginal: ingreso.fecha });
      return false;
    }
    
    const periodo = getMesKey(mes, año);
    
    // Validar que periodo sea un string válido
    if (!periodo || typeof periodo !== 'string' || periodo.length < 7) {
      console.error('Periodo inválido:', { periodo, mes, año });
      return false;
    }
    
    // Validar que todos los campos requeridos estén presentes
    if (!ingreso.descripcion || ingreso.monto === undefined || ingreso.monto === null) {
      console.error('Campos faltantes:', { periodo, descripcion: ingreso.descripcion, monto: ingreso.monto });
      return false;
    }
    
    const ingresoData = {
      periodo: String(periodo), // Asegurar que sea string
      descripcion: String(ingreso.descripcion || '').trim(),
      monto: parseFloat(ingreso.monto) || 0,
      fecha: fecha.toISOString(), // Convertir a string ISO para evitar problemas de serialización
      categoria: ingreso.categoria ? String(ingreso.categoria).trim() : '',
      fechaCreacion: new Date().toISOString()
    };
    
    // Validación final antes de enviar
    if (!ingresoData.periodo || !ingresoData.descripcion || ingresoData.monto <= 0) {
      console.error('Datos inválidos antes de enviar:', ingresoData);
      return false;
    }
    
    console.log('Enviando ingreso:', ingresoData);
    
    const jsonBody = JSON.stringify(ingresoData);
    console.log('JSON stringificado:', jsonBody);
    console.log('Longitud del JSON:', jsonBody.length);
    
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
    
    const response = await fetch('/api/ingresos', fetchOptions);
    
    // Log para debugging
    console.log('Respuesta del servidor:', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });
    
    // Si el status es 201 (Created) o response.ok es true, el ingreso se creó exitosamente
    if (response.status === 201 || response.ok) {
      // Intentar parsear la respuesta para verificar success, pero no es crítico
      try {
        const data = await response.json();
        // Si tiene success: true, perfecto. Si no, pero el status es 201, también es OK
        if (data && data.success === true) {
          console.log('Ingreso agregado exitosamente (success: true)');
          return true;
        }
        // Si el status es 201, considerar exitoso aunque success no sea true
        if (response.status === 201) {
          console.log('Ingreso agregado exitosamente (status 201)');
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
      console.log('Ingreso agregado exitosamente (response.ok)');
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
    
    console.error('Error al agregar ingreso:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      error: errorText
    });
    return false;
  } catch (error) {
    console.error('Error al guardar ingreso:', error);
    return false;
  }
}

// Eliminar un ingreso manual
export async function eliminarIngreso(ingresoId, mes, año) {
  try {
    const response = await fetch(`/api/ingresos/${ingresoId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al eliminar ingreso:', error);
    return false;
  }
}

// Obtener meses con registros de ingresos
export async function getMesesConIngresos() {
  try {
    const response = await fetch('/api/ingresos');
    const data = await response.json();
    
    if (data.success) {
      const meses = [...new Set(data.data.map(i => i.periodo))];
      return meses.filter(m => m).sort().reverse();
    }
    return [];
  } catch (error) {
    console.error('Error al leer meses con ingresos:', error);
    return [];
  }
}
