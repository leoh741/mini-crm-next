const INGRESOS_KEY = 'crm_ingresos';

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener todos los ingresos manuales de un mes específico
export function getIngresosMes(mes, año) {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const todosLosIngresos = JSON.parse(localStorage.getItem(INGRESOS_KEY) || '{}');
    const mesKey = getMesKey(mes, año);
    return todosLosIngresos[mesKey] || [];
  } catch (error) {
    console.error('Error al leer ingresos:', error);
    return [];
  }
}

// Agregar un nuevo ingreso manual
export function agregarIngreso(ingreso) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const todosLosIngresos = JSON.parse(localStorage.getItem(INGRESOS_KEY) || '{}');
    const fecha = new Date(ingreso.fecha || new Date());
    const mes = fecha.getMonth();
    const año = fecha.getFullYear();
    const mesKey = getMesKey(mes, año);
    
    if (!todosLosIngresos[mesKey]) {
      todosLosIngresos[mesKey] = [];
    }
    
    const nuevoIngreso = {
      id: Date.now().toString(),
      descripcion: ingreso.descripcion,
      monto: parseFloat(ingreso.monto) || 0,
      fecha: fecha.toISOString().split('T')[0], // YYYY-MM-DD
      categoria: ingreso.categoria || '',
      fechaCreacion: new Date().toISOString()
    };
    
    todosLosIngresos[mesKey].push(nuevoIngreso);
    localStorage.setItem(INGRESOS_KEY, JSON.stringify(todosLosIngresos));
    return true;
  } catch (error) {
    console.error('Error al guardar ingreso:', error);
    return false;
  }
}

// Eliminar un ingreso manual
export function eliminarIngreso(ingresoId, mes, año) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const todosLosIngresos = JSON.parse(localStorage.getItem(INGRESOS_KEY) || '{}');
    const mesKey = getMesKey(mes, año);
    
    if (todosLosIngresos[mesKey]) {
      todosLosIngresos[mesKey] = todosLosIngresos[mesKey].filter(i => i.id !== ingresoId);
      localStorage.setItem(INGRESOS_KEY, JSON.stringify(todosLosIngresos));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error al eliminar ingreso:', error);
    return false;
  }
}

// Obtener meses con registros de ingresos
export function getMesesConIngresos() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const todosLosIngresos = JSON.parse(localStorage.getItem(INGRESOS_KEY) || '{}');
    return Object.keys(todosLosIngresos)
      .filter(key => todosLosIngresos[key].length > 0)
      .sort()
      .reverse();
  } catch (error) {
    console.error('Error al leer meses con ingresos:', error);
    return [];
  }
}

