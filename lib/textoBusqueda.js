export function sinAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function coincideBusqueda(texto, keyword) {
  const aguja = sinAcento(keyword).trim();
  if (!aguja) return true;
  return sinAcento(texto).includes(aguja);
}

const VOCALES = {
  a: '[aáàäâ]',
  e: '[eéèëê]',
  i: '[iíìïî]',
  o: '[oóòöô]',
  u: '[uúùüû]',
  n: '[nñ]'
};

export function regexBusqueda(texto) {
  const base = sinAcento(texto).trim();
  let fuente = '';
  for (const char of base) {
    fuente += VOCALES[char] || char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(fuente, 'i');
}
