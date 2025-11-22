// Utilidades para gestionar ingresos usando la API de MongoDB

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener todos los ingresos manuales de un mes específico
export async function getIngresosMes(mes, año) {
  try {
    const periodo = getMesKey(mes, año);
    const response = await fetch(`/api/ingresos?periodo=${periodo}`, {
      cache: 'no-store' // Sin caché para datos siempre frescos
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
    const fecha = new Date(ingreso.fecha || new Date());
    const mes = fecha.getMonth();
    const año = fecha.getFullYear();
    const periodo = getMesKey(mes, año);
    
    const ingresoData = {
      periodo,
      descripcion: ingreso.descripcion,
      monto: parseFloat(ingreso.monto) || 0,
      fecha: fecha,
      categoria: ingreso.categoria || '',
      fechaCreacion: new Date()
    };
    
    const response = await fetch('/api/ingresos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ingresoData)
    });
    
    const data = await response.json();
    return data.success;
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
