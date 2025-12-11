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

        // PROTECCIÓN CRÍTICA: Mostrar advertencia clara antes de importar
        const advertencia = `⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n` +
          `Esta operación ACTUALIZARÁ TODOS los datos existentes en la base de datos y los reemplazará con los datos del backup.\n\n` +
          `Esto incluye:\n` +
          `- Todos los clientes\n` +
          `- Todos los pagos\n` +
          `- Todos los gastos e ingresos\n` +
          `- Todos los presupuestos\n` +
          `- Todas las reuniones\n` +
          `- Todas las tareas\n\n` +
          `¿Estás ABSOLUTAMENTE SEGURO de que quieres continuar?\n\n` +
          `Esta acción NO se puede deshacer.`;
        
        const confirmarImportacion = window.confirm(advertencia);
        if (!confirmarImportacion) {
          reject(new Error('Importación cancelada por el usuario'));
          return;
        }
        
        // Segunda confirmación adicional
        const confirmarSegunda = window.confirm('⚠️ ÚLTIMA CONFIRMACIÓN ⚠️\n\n' +
          'Estás a punto de ACTUALIZAR TODOS los datos existentes.\n\n' +
          '¿Confirmas que quieres proceder?');
        if (!confirmarSegunda) {
          reject(new Error('Importación cancelada por el usuario'));
          return;
        }
        
        // Importar a MongoDB a través de la API
        // Agregar confirmación explícita requerida por el endpoint
        // PROTECCIÓN: Requerir confirmación triple para borrar datos
        // Generar token de seguridad único para esta operación
        const tokenSeguridad = `import-${Date.now()}-${Math.random().toString(36).slice(2, 15)}-${Math.random().toString(36).slice(2, 15)}`;
        
        // Asegurar que los datos estén en el formato correcto
        // El backend puede recibir arrays/objetos directamente o como strings JSON
        const datosParaEnviar = {
          clientes: datos.clientes || [],
          pagosMensuales: datos.pagosMensuales || {},
          gastos: datos.gastos || {},
          ingresos: datos.ingresos || {},
          usuarios: datos.usuarios || [],
          presupuestos: datos.presupuestos || [],
          reuniones: datos.reuniones || [],
          tareas: datos.tareas || [],
          equipo: datos.equipo || [],
          activityLists: datos.activityLists || [],
          activities: datos.activities || [],
          clientesEliminados: datos.clientesEliminados || [],
          confirmDelete: true,  // Primera confirmación explícita requerida para borrar datos
          confirmDelete2: true,  // Segunda confirmación requerida
          confirmDeleteAll: true,  // Confirmación adicional para borrar datos existentes
          tokenSeguridad: tokenSeguridad  // Token de seguridad único
        };
        
        console.log('[BACKUP IMPORT] Datos a enviar:', {
          clientes: Array.isArray(datosParaEnviar.clientes) ? `${datosParaEnviar.clientes.length} clientes` : typeof datosParaEnviar.clientes,
          pagosMensuales: typeof datosParaEnviar.pagosMensuales === 'object' ? `${Object.keys(datosParaEnviar.pagosMensuales).length} meses` : typeof datosParaEnviar.pagosMensuales,
          gastos: typeof datosParaEnviar.gastos === 'object' ? `${Object.keys(datosParaEnviar.gastos).length} periodos` : typeof datosParaEnviar.gastos,
          ingresos: typeof datosParaEnviar.ingresos === 'object' ? `${Object.keys(datosParaEnviar.ingresos).length} periodos` : typeof datosParaEnviar.ingresos,
          usuarios: Array.isArray(datosParaEnviar.usuarios) ? `${datosParaEnviar.usuarios.length} usuarios` : typeof datosParaEnviar.usuarios,
          presupuestos: Array.isArray(datosParaEnviar.presupuestos) ? `${datosParaEnviar.presupuestos.length} presupuestos` : typeof datosParaEnviar.presupuestos,
          reuniones: Array.isArray(datosParaEnviar.reuniones) ? `${datosParaEnviar.reuniones.length} reuniones` : typeof datosParaEnviar.reuniones,
          tareas: Array.isArray(datosParaEnviar.tareas) ? `${datosParaEnviar.tareas.length} tareas` : typeof datosParaEnviar.tareas,
          equipo: Array.isArray(datosParaEnviar.equipo) ? `${datosParaEnviar.equipo.length} miembros` : typeof datosParaEnviar.equipo,
          activityLists: Array.isArray(datosParaEnviar.activityLists) ? `${datosParaEnviar.activityLists.length} listas` : typeof datosParaEnviar.activityLists,
          activities: Array.isArray(datosParaEnviar.activities) ? `${datosParaEnviar.activities.length} actividades` : typeof datosParaEnviar.activities
        });
        
        const response = await fetch('/api/backup/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(datosParaEnviar)
        });

        const result = await response.json();

        // Si hay advertencia de pérdida de datos, mostrar diálogo de confirmación
        if (!response.ok && result.requiereConfirmacion && result.advertencias) {
          const mensajeAdvertencia = `⚠️ ADVERTENCIA: El backup contiene MENOS datos que los existentes.\n\n${result.advertencias.join('\n')}\n\n¿Estás seguro de que quieres continuar? Esto causará pérdida de información.`;
          
          const confirmar = window.confirm(mensajeAdvertencia);
          if (!confirmar) {
            reject(new Error('Importación cancelada por el usuario'));
            return;
          }
          
          // Reintentar con confirmación de pérdida de datos
          // Generar nuevo token de seguridad para el reintento
          const tokenSeguridadRetry = `import-retry-${Date.now()}-${Math.random().toString(36).slice(2, 15)}-${Math.random().toString(36).slice(2, 15)}`;
          
          const datosConConfirmacionCompleta = {
            clientes: datos.clientes || [],
            pagosMensuales: datos.pagosMensuales || {},
            gastos: datos.gastos || {},
            ingresos: datos.ingresos || {},
            usuarios: datos.usuarios || [],
            presupuestos: datos.presupuestos || [],
            reuniones: datos.reuniones || [],
            tareas: datos.tareas || [],
            equipo: datos.equipo || [],
            clientesEliminados: datos.clientesEliminados || [],
            confirmDelete: true,
            confirmDelete2: true,
            confirmDeleteAll: true,
            confirmDataLoss: true,
            tokenSeguridad: tokenSeguridadRetry
          };
          
          const responseRetry = await fetch('/api/backup/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(datosConConfirmacionCompleta)
          });
          
          const resultRetry = await responseRetry.json();
          
          if (!responseRetry.ok || !resultRetry.success) {
            reject(new Error(resultRetry.error || 'Error al importar los datos a MongoDB'));
            return;
          }
          
          resolve(resultRetry);
          return;
        }

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

