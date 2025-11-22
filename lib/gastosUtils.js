const GASTOS_KEY = 'crm_gastos';

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener todos los gastos de un mes específico
export function getGastosMes(mes, año) {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const todosLosGastos = JSON.parse(localStorage.getItem(GASTOS_KEY) || '{}');
    const mesKey = getMesKey(mes, año);
    return todosLosGastos[mesKey] || [];
  } catch (error) {
    console.error('Error al leer gastos:', error);
    return [];
  }
}

// Agregar un nuevo gasto
export function agregarGasto(gasto) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const todosLosGastos = JSON.parse(localStorage.getItem(GASTOS_KEY) || '{}');
    const fecha = new Date(gasto.fecha || new Date());
    const mes = fecha.getMonth();
    const año = fecha.getFullYear();
    const mesKey = getMesKey(mes, año);
    
    if (!todosLosGastos[mesKey]) {
      todosLosGastos[mesKey] = [];
    }
    
    const nuevoGasto = {
      id: Date.now().toString(),
      descripcion: gasto.descripcion,
      monto: parseFloat(gasto.monto) || 0,
      fecha: fecha.toISOString().split('T')[0], // YYYY-MM-DD
      categoria: gasto.categoria || '',
      fechaCreacion: new Date().toISOString()
    };
    
    todosLosGastos[mesKey].push(nuevoGasto);
    localStorage.setItem(GASTOS_KEY, JSON.stringify(todosLosGastos));
    return true;
  } catch (error) {
    console.error('Error al guardar gasto:', error);
    return false;
  }
}

// Eliminar un gasto
export function eliminarGasto(gastoId, mes, año) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const todosLosGastos = JSON.parse(localStorage.getItem(GASTOS_KEY) || '{}');
    const mesKey = getMesKey(mes, año);
    
    if (todosLosGastos[mesKey]) {
      todosLosGastos[mesKey] = todosLosGastos[mesKey].filter(g => g.id !== gastoId);
      localStorage.setItem(GASTOS_KEY, JSON.stringify(todosLosGastos));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error al eliminar gasto:', error);
    return false;
  }
}

// Obtener meses con registros de gastos
export function getMesesConGastos() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const todosLosGastos = JSON.parse(localStorage.getItem(GASTOS_KEY) || '{}');
    return Object.keys(todosLosGastos)
      .filter(key => todosLosGastos[key].length > 0)
      .sort()
      .reverse();
  } catch (error) {
    console.error('Error al leer meses con gastos:', error);
    return [];
  }
}

