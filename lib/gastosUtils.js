// Utilidades para gestionar gastos usando la API de MongoDB

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener todos los gastos de un mes específico
export async function getGastosMes(mes, año) {
  try {
    const periodo = getMesKey(mes, año);
    const response = await fetch(`/api/gastos?periodo=${periodo}`, {
      cache: 'no-store' // Sin caché para datos siempre frescos
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
    const fecha = new Date(gasto.fecha || new Date());
    const mes = fecha.getMonth();
    const año = fecha.getFullYear();
    const periodo = getMesKey(mes, año);
    
    const gastoData = {
      periodo,
      descripcion: gasto.descripcion,
      monto: parseFloat(gasto.monto) || 0,
      fecha: fecha,
      categoria: gasto.categoria || '',
      fechaCreacion: new Date()
    };
    
    const response = await fetch('/api/gastos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gastoData)
    });
    
    // Parsear la respuesta JSON primero
    const data = await response.json();
    
    // Si la respuesta HTTP es exitosa (200-299) Y success es true, retornar true
    // También considerar exitoso si la respuesta tiene status 201 aunque success no esté explícitamente true
    if (response.ok && (data.success === true || response.status === 201)) {
      return true;
    }
    
    // Si llegamos aquí, hubo un error
    console.error('Error al agregar gasto:', {
      status: response.status,
      statusText: response.statusText,
      data: data
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
