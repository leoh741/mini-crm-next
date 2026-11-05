// "05 11" en el título es 05/11 del año del filtro (día y mes, sin año escrito).

function fechaDelNombre(titulo, anio) {
  if (!titulo || !anio) return null;
  const re = /(?:^|[^\d])(\d{1,2})\s+(\d{1,2})(?!\d)/g;
  let match;
  let ultima = null;
  while ((match = re.exec(titulo)) !== null) {
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) continue;
    ultima = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return ultima;
}

function aniosDelRango(dateFrom, dateTo) {
  const actual = new Date().getFullYear();
  const desde = Number(String(dateFrom || '').slice(0, 4));
  const hasta = Number(String(dateTo || '').slice(0, 4));
  const inicio = Number.isInteger(desde) && desde > 1900 ? desde : (Number.isInteger(hasta) && hasta > 1900 ? hasta : actual);
  const fin = Number.isInteger(hasta) && hasta > 1900 ? hasta : inicio;
  const anios = [];
  const tope = Math.min(fin, inicio + 5);
  for (let anio = Math.min(inicio, tope); anio <= tope; anio += 1) anios.push(anio);
  return anios;
}

function diaIso(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toISOString().slice(0, 10);
}

function diaLocal(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function dentroDelRango(iso, dateFrom, dateTo) {
  if (!iso) return false;
  if (dateFrom && iso < dateFrom) return false;
  if (dateTo && iso > dateTo) return false;
  return true;
}

// Vencimiento, si está. Si no, la fecha del nombre (05 11). Si tampoco, el día en que se creó.
export function actividadCaeEnRango(activity, dateFrom, dateTo) {
  const porVencimiento = diaIso(activity?.dueDate);
  if (porVencimiento) return dentroDelRango(porVencimiento, dateFrom, dateTo);

  const titulo = activity?.title || '';
  const porNombre = aniosDelRango(dateFrom, dateTo).some((anio) => (
    dentroDelRango(fechaDelNombre(titulo, anio), dateFrom, dateTo)
  ));
  if (porNombre) return true;

  const tieneFechaEnNombre = aniosDelRango(dateFrom, dateTo).some((anio) => fechaDelNombre(titulo, anio));
  if (tieneFechaEnNombre) return false;

  return dentroDelRango(diaLocal(activity?.createdAt), dateFrom, dateTo);
}
