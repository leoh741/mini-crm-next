// Conserva tildes, ñ y demás letras; solo quita caracteres inválidos en nombres de archivo (Windows/macOS/Linux)
export function limpiarNombreArchivo(texto, fallback = 'Archivo') {
  const limpio = String(texto || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return limpio || fallback;
}
