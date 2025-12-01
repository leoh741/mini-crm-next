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
  
  // Limpiar el mapa para las etiquetas que estamos procesando
  // Esto asegura que no haya colores duplicados
  const coloresAsignados = new Set();
  const nuevoMapa = new Map();
  
  // Primero, intentar mantener colores existentes si no hay conflictos
  const coloresUsados = new Map(); // color -> [etiquetas que lo usan]
  
  etiquetasUnicas.forEach((etiqueta) => {
    if (etiquetaColorMap.has(etiqueta)) {
      const color = etiquetaColorMap.get(etiqueta);
      if (!coloresUsados.has(color)) {
        coloresUsados.set(color, []);
      }
      coloresUsados.get(color).push(etiqueta);
    }
  });
  
  // Asignar colores de forma única, corrigiendo duplicados
  etiquetasUnicas.forEach((etiqueta, index) => {
    let colorAsignado = null;
    
    // Si la etiqueta ya tenía un color y no hay conflicto, mantenerlo
    if (etiquetaColorMap.has(etiqueta)) {
      const colorExistente = etiquetaColorMap.get(etiqueta);
      const etiquetasConEsteColor = coloresUsados.get(colorExistente) || [];
      
      // Si es la primera etiqueta con este color (alfabéticamente), mantener el color
      if (etiquetasConEsteColor.length > 0 && etiquetasConEsteColor[0] === etiqueta && !coloresAsignados.has(colorExistente)) {
        colorAsignado = colorExistente;
        coloresAsignados.add(colorAsignado);
      }
    }
    
    // Si no se asignó un color, buscar uno disponible
    if (!colorAsignado) {
      // Buscar un color que no esté siendo usado
      for (const colorCandidato of COLORES_DISPONIBLES) {
        if (!coloresAsignados.has(colorCandidato)) {
          colorAsignado = colorCandidato;
          coloresAsignados.add(colorAsignado);
          break;
        }
      }
      
      // Si todos los colores están usados, usar uno circularmente pero asegurando unicidad
      if (!colorAsignado) {
        const colorIndex = index % COLORES_DISPONIBLES.length;
        colorAsignado = COLORES_DISPONIBLES[colorIndex];
        // Si este color ya está asignado, buscar el siguiente disponible
        let intentos = 0;
        while (coloresAsignados.has(colorAsignado) && intentos < COLORES_DISPONIBLES.length) {
          const siguienteIndex = (colorIndex + intentos + 1) % COLORES_DISPONIBLES.length;
          colorAsignado = COLORES_DISPONIBLES[siguienteIndex];
          intentos++;
        }
        coloresAsignados.add(colorAsignado);
      }
    }
    
    nuevoMapa.set(etiqueta, colorAsignado);
  });
  
  // Actualizar el mapa global con los nuevos colores únicos
  nuevoMapa.forEach((color, etiqueta) => {
    etiquetaColorMap.set(etiqueta, color);
  });

  return etiquetaColorMap;
}

// Función para obtener el color de una etiqueta específica
export function getTagColor(etiqueta, todasLasEtiquetas = []) {
  if (!etiqueta) return COLORES_DISPONIBLES[0];
  
  const etiquetaLower = etiqueta.toLowerCase();
  
  // Si tenemos todas las etiquetas, asegurarnos de que los colores estén asignados correctamente
  if (todasLasEtiquetas.length > 0) {
    // Normalizar todas las etiquetas
    const etiquetasNormalizadas = todasLasEtiquetas.map(e => e.toLowerCase());
    // Asegurarnos de que la etiqueta actual esté incluida
    if (!etiquetasNormalizadas.includes(etiquetaLower)) {
      etiquetasNormalizadas.push(etiquetaLower);
    }
    // Asignar colores únicos para todas las etiquetas
    asignarColoresUnicos(etiquetasNormalizadas);
    
    // Si ahora está en el mapa, devolver ese color
    if (etiquetaColorMap.has(etiquetaLower)) {
      return etiquetaColorMap.get(etiquetaLower);
    }
  }
  
  // Si ya está en el mapa, devolver ese color
  if (etiquetaColorMap.has(etiquetaLower)) {
    return etiquetaColorMap.get(etiquetaLower);
  }
  
  // Fallback: buscar un color disponible que no esté siendo usado
  const coloresEnUso = new Set(Array.from(etiquetaColorMap.values()));
  let colorDisponible = null;
  
  for (const colorCandidato of COLORES_DISPONIBLES) {
    if (!coloresEnUso.has(colorCandidato)) {
      colorDisponible = colorCandidato;
      break;
    }
  }
  
  // Si no hay color disponible, usar uno basado en hash pero asegurando unicidad
  if (!colorDisponible) {
    const hash = etiquetaLower.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorIndex = hash % COLORES_DISPONIBLES.length;
    colorDisponible = COLORES_DISPONIBLES[colorIndex];
    
    // Si este color ya está en uso, buscar el siguiente disponible
    let intentos = 0;
    while (coloresEnUso.has(colorDisponible) && intentos < COLORES_DISPONIBLES.length) {
      const siguienteIndex = (colorIndex + intentos + 1) % COLORES_DISPONIBLES.length;
      colorDisponible = COLORES_DISPONIBLES[siguienteIndex];
      intentos++;
    }
  }
  
  // Guardar en el mapa para consistencia
  etiquetaColorMap.set(etiquetaLower, colorDisponible);
  
  return colorDisponible;
}

// Función para capitalizar la primera letra de una etiqueta
export const capitalizarEtiqueta = (etiqueta) => {
  if (!etiqueta) return '';
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
};

// Función para resetear el mapa (útil para testing o recarga)
export function resetTagColors() {
  etiquetaColorMap = new Map();
}

