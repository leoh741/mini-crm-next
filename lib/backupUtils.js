// Funciones para exportar e importar todos los datos del CRM

export async function exportarDatos() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // Obtener datos de MongoDB a través de la API
    const response = await fetch('/api/backup/export');
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al exportar los datos');
    }

    // result.data ya contiene los datos con clientes como strings JSON
    // Devolver directamente result.data como JSON, sin serializar de nuevo
    return JSON.stringify(result.data, null, 2);
  } catch (error) {
    console.error('Error al exportar datos:', error);
    // Fallback a localStorage si la API falla
    try {
      const datos = {
        clientes: localStorage.getItem('crm_clientes') || '[]',
        pagosMensuales: localStorage.getItem('crm_pagos_mensuales') || '{}',
        clientesEliminados: localStorage.getItem('crm_clientes_eliminados') || '[]',
        gastos: localStorage.getItem('crm_gastos') || '{}',
        ingresos: localStorage.getItem('crm_ingresos') || '{}',
        usuarios: localStorage.getItem('crm_usuarios') || '[]',
        fechaExportacion: new Date().toISOString(),
        version: '1.1'
      };
      return JSON.stringify(datos, null, 2);
    } catch (fallbackError) {
      console.error('Error en fallback de exportación:', fallbackError);
      return null;
    }
  }
}

export function importarDatos(jsonString) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const datos = JSON.parse(jsonString);
    
    // Validar que tenga la estructura correcta
    if (!datos.clientes || !datos.pagosMensuales) {
      throw new Error('Formato de datos inválido');
    }

    // Restaurar todos los datos
    localStorage.setItem('crm_clientes', datos.clientes);
    localStorage.setItem('crm_pagos_mensuales', datos.pagosMensuales);
    if (datos.clientesEliminados) {
      localStorage.setItem('crm_clientes_eliminados', datos.clientesEliminados);
    }
    if (datos.gastos) {
      localStorage.setItem('crm_gastos', datos.gastos);
    }
    if (datos.ingresos) {
      localStorage.setItem('crm_ingresos', datos.ingresos);
    }
    if (datos.usuarios) {
      localStorage.setItem('crm_usuarios', datos.usuarios);
    }

    return true;
  } catch (error) {
    console.error('Error al importar datos:', error);
    return false;
  }
}

export async function descargarBackup() {
  try {
    const datos = await exportarDatos();
    if (!datos) {
      alert('Error al exportar los datos');
      return;
    }

    const blob = new Blob([datos], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const fecha = new Date().toISOString().split('T')[0];
    const nombreArchivo = `crm_backup_${fecha}.json`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error al descargar backup:', error);
    alert('Error al exportar los datos: ' + error.message);
  }
}

export async function cargarBackup(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const contenido = e.target.result;
        const datos = JSON.parse(contenido);
        
        // Validar estructura básica
        if (!datos.clientes && !datos.pagosMensuales) {
          reject(new Error('Formato de datos inválido'));
          return;
        }

        // Importar a MongoDB a través de la API
        // Agregar confirmación explícita requerida por el endpoint
        // PROTECCIÓN: Requerir confirmación doble si hay datos existentes
        const datosConConfirmacion = {
          ...datos,
          confirmDelete: true,  // Confirmación explícita requerida para borrar datos
          confirmDeleteAll: true  // Confirmación doble para borrar datos existentes
        };
        
        const response = await fetch('/api/backup/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(datosConConfirmacion)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          reject(new Error(result.error || 'Error al importar los datos a MongoDB'));
          return;
        }

        // Limpiar localStorage y cachés para evitar conflictos
        if (typeof window !== 'undefined') {
          // Limpiar formato antiguo (por si acaso)
          localStorage.removeItem('crm_clientes');
          localStorage.removeItem('crm_pagos_mensuales');
          localStorage.removeItem('crm_clientes_eliminados');
          localStorage.removeItem('crm_gastos');
          localStorage.removeItem('crm_ingresos');
          localStorage.removeItem('crm_usuarios');
          
          // Limpiar formato nuevo (caché actual)
          localStorage.removeItem('crm_clientes_cache');
          localStorage.removeItem('crm_estados_pago_cache');
          localStorage.removeItem('crm_clientes_pending');
          localStorage.removeItem('crm_estados_pago_pending');
          localStorage.removeItem('crm_last_sync');
          
          // Limpiar cachés en memoria y localStorage
          try {
            const { limpiarTodosLosCaches } = await import('./clientesUtils');
            if (limpiarTodosLosCaches) {
              limpiarTodosLosCaches();
            }
          } catch (cacheError) {
            console.warn('No se pudo limpiar los cachés:', cacheError);
            // No es crítico, continuar
          }
          
          // Disparar evento para que las páginas se actualicen
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('clientes:force-refresh'));
            // También disparar un evento de storage para compatibilidad
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'crm_clientes_cache',
              newValue: null,
              oldValue: null
            }));
          }
        }

        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error al leer el archivo'));
    };
    
    reader.readAsText(archivo);
  });
}

