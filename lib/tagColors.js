// Sistema de colores únicos para etiquetas
const COLORES_DISPONIBLES = [
  'bg-blue-900/30 text-blue-400 border-blue-700',
  'bg-purple-900/30 text-purple-400 border-purple-700',
  'bg-green-900/30 text-green-400 border-green-700',
  'bg-yellow-900/30 text-yellow-400 border-yellow-700',
  'bg-pink-900/30 text-pink-400 border-pink-700',
  'bg-indigo-900/30 text-indigo-400 border-indigo-700',
  'bg-teal-900/30 text-teal-400 border-teal-700',
  'bg-orange-900/30 text-orange-400 border-orange-700',
  'bg-cyan-900/30 text-cyan-400 border-cyan-700',
  'bg-rose-900/30 text-rose-400 border-rose-700',
  'bg-emerald-900/30 text-emerald-400 border-emerald-700',
  'bg-amber-900/30 text-amber-400 border-amber-700',
  'bg-violet-900/30 text-violet-400 border-violet-700',
  'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-700',
  'bg-sky-900/30 text-sky-400 border-sky-700',
  'bg-lime-900/30 text-lime-400 border-lime-700',
];

// Mapa global para mantener consistencia de colores
let etiquetaColorMap = new Map();

// Función para obtener todas las etiquetas únicas y asignarles colores
export function asignarColoresUnicos(todasLasEtiquetas) {
  if (!todasLasEtiquetas || todasLasEtiquetas.length === 0) {
    return new Map();
  }

  // Obtener etiquetas únicas ordenadas
  const etiquetasUnicas = Array.from(new Set(todasLasEtiquetas.map(e => e.toLowerCase()))).sort();
  
  // Primero, detectar y corregir colores duplicados existentes
  const coloresUsados = new Map(); // color -> [etiquetas que lo usan]
  const etiquetasConColor = [];
  const etiquetasSinColor = [];
  
  // Separar etiquetas con y sin color
  etiquetasUnicas.forEach((etiqueta) => {
    if (etiquetaColorMap.has(etiqueta)) {
      etiquetasConColor.push(etiqueta);
      const color = etiquetaColorMap.get(etiqueta);
      if (!coloresUsados.has(color)) {
        coloresUsados.set(color, []);
      }
      coloresUsados.get(color).push(etiqueta);
    } else {
      etiquetasSinColor.push(etiqueta);
    }
  });
  
  // Detectar y corregir colores duplicados
  const coloresAsignados = new Set();
  coloresUsados.forEach((etiquetasConMismoColor, color) => {
    if (etiquetasConMismoColor.length > 1) {
      // Mantener el primero (alfabéticamente) con su color
      const primeraEtiqueta = etiquetasConMismoColor[0];
      etiquetaColorMap.set(primeraEtiqueta, color);
      coloresAsignados.add(color);
      
      // Reasignar colores únicos a las demás
      for (let i = 1; i < etiquetasConMismoColor.length; i++) {
        const etiqueta = etiquetasConMismoColor[i];
        // Buscar un color disponible
        let colorDisponible = null;
        for (const colorCandidato of COLORES_DISPONIBLES) {
          if (!coloresAsignados.has(colorCandidato)) {
            colorDisponible = colorCandidato;
            break;
          }
        }
        
        if (colorDisponible) {
          etiquetaColorMap.set(etiqueta, colorDisponible);
          coloresAsignados.add(colorDisponible);
        } else {
          // Si no hay colores disponibles, usar el siguiente en la lista circularmente
          const colorIndex = COLORES_DISPONIBLES.indexOf(color);
          const nuevoIndex = (colorIndex + i) % COLORES_DISPONIBLES.length;
          const nuevoColor = COLORES_DISPONIBLES[nuevoIndex];
          etiquetaColorMap.set(etiqueta, nuevoColor);
          coloresAsignados.add(nuevoColor);
        }
      }
    } else {
      // Solo una etiqueta con este color, mantenerlo
      coloresAsignados.add(color);
    }
  });
  
  // Asignar colores a etiquetas sin color
  etiquetasSinColor.forEach((etiqueta) => {
    // Buscar un color disponible
    let colorDisponible = null;
    for (const colorCandidato of COLORES_DISPONIBLES) {
      if (!coloresAsignados.has(colorCandidato)) {
        colorDisponible = colorCandidato;
        break;
      }
    }
    
    if (colorDisponible) {
      etiquetaColorMap.set(etiqueta, colorDisponible);
      coloresAsignados.add(colorDisponible);
    } else {
      // Si no hay colores disponibles, usar el siguiente disponible en orden circular
      const index = etiquetasSinColor.indexOf(etiqueta);
      const colorIndex = (index + coloresAsignados.size) % COLORES_DISPONIBLES.length;
      const color = COLORES_DISPONIBLES[colorIndex];
      etiquetaColorMap.set(etiqueta, color);
      coloresAsignados.add(color);
    }
  });

  return etiquetaColorMap;
}

// Función para obtener el color de una etiqueta específica
export function getTagColor(etiqueta, todasLasEtiquetas = []) {
  if (!etiqueta) return COLORES_DISPONIBLES[0];
  
  const etiquetaLower = etiqueta.toLowerCase();
  
  // Si ya está en el mapa, devolver ese color
  if (etiquetaColorMap.has(etiquetaLower)) {
    return etiquetaColorMap.get(etiquetaLower);
  }
  
  // Si tenemos todas las etiquetas, asignar colores primero
  if (todasLasEtiquetas.length > 0) {
    asignarColoresUnicos(todasLasEtiquetas);
    if (etiquetaColorMap.has(etiquetaLower)) {
      return etiquetaColorMap.get(etiquetaLower);
    }
  }
  
  // Fallback: usar hash para asignar un color
  const hash = etiquetaLower.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorIndex = hash % COLORES_DISPONIBLES.length;
  const color = COLORES_DISPONIBLES[colorIndex];
  
  // Guardar en el mapa para consistencia
  etiquetaColorMap.set(etiquetaLower, color);
  
  return color;
}

// Función para resetear el mapa (útil para testing o recarga)
export function resetTagColors() {
  etiquetaColorMap = new Map();
}

