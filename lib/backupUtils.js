// Funciones para exportar e importar todos los datos del CRM

export function exportarDatos() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const datos = {
      clientes: localStorage.getItem('crm_clientes') || '{}',
      pagosMensuales: localStorage.getItem('crm_pagos_mensuales') || '{}',
      clientesEliminados: localStorage.getItem('crm_clientes_eliminados') || '[]',
      gastos: localStorage.getItem('crm_gastos') || '{}',
      ingresos: localStorage.getItem('crm_ingresos') || '{}',
      usuarios: localStorage.getItem('crm_usuarios') || '[]',
      fechaExportacion: new Date().toISOString(),
      version: '1.1'
    };

    return JSON.stringify(datos, null, 2);
  } catch (error) {
    console.error('Error al exportar datos:', error);
    return null;
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

export function descargarBackup() {
  const datos = exportarDatos();
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
}

export function cargarBackup(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const contenido = e.target.result;
        if (importarDatos(contenido)) {
          resolve(true);
        } else {
          reject(new Error('Error al importar los datos'));
        }
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

