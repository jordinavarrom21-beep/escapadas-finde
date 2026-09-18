/**
 * Fechas en la zona horaria de Madrid. Los días se representan como
 * 'YYYY-MM-DD' y se opera con ellos con aritmética de calendario pura.
 */

export const ZONA = 'Europe/Madrid';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
});
const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Día local de Madrid como 'YYYY-MM-DD'. */
export function fechaLocal(fecha = new Date()) {
  return formatoFecha.format(fecha);
}

/** Hora local de Madrid: { hora, minuto, diaSemana (0 = domingo) }. */
export function horaLocal(fecha = new Date()) {
  const [hora, minuto] = formatoHora.format(fecha).split(':').map(Number);
  return { hora, minuto, diaSemana: diaSemana(fechaLocal(fecha)) };
}

function aUtc(iso) {
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/** Suma (o resta) días a 'YYYY-MM-DD'. */
export function sumarDias(iso, dias) {
  return new Date(aUtc(iso) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Día de la semana de 'YYYY-MM-DD': 0 = domingo … 6 = sábado. */
export function diaSemana(iso) {
  return new Date(aUtc(iso)).getUTCDay();
}

/** Días naturales entre dos fechas 'YYYY-MM-DD' (hasta − desde). */
export function diasEntre(desde, hasta) {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000);
}

/** '2026-10-16' → 'vie 16 oct'. */
export function etiquetaDia(iso) {
  const [, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return `${DIAS[diaSemana(iso)]} ${dia} ${MESES[mes - 1]}`;
}

/** '2026-10-16T23:40:00' (hora local del aeropuerto) → 'vie 16 oct 23:40'. */
export function etiquetaFechaHora(local) {
  return `${etiquetaDia(local)} ${local.slice(11, 16)}`;
}

/** Rango corto: '9–12 oct' o '30 oct – 1 nov'. */
export function etiquetaRango(desde, hasta) {
  const [, mesDesde, diaDesde] = desde.split('-').map(Number);
  const [, mesHasta, diaHasta] = hasta.split('-').map(Number);
  return mesDesde === mesHasta
    ? `${diaDesde}–${diaHasta} ${MESES[mesHasta - 1]}`
    : `${diaDesde} ${MESES[mesDesde - 1]} – ${diaHasta} ${MESES[mesHasta - 1]}`;
}

/**
 * Los próximos `n` fines de semana (viernes a domingo). Si hoy es viernes,
 * sábado o domingo, el primero es el fin de semana en curso.
 * @returns {{id: string, viernes: string, sabado: string, domingo: string, etiqueta: string}[]}
 */
export function findesProximos(n, ahora = new Date()) {
  const hoy = fechaLocal(ahora);
  const dia = diaSemana(hoy);
  const desplazamiento = { 5: 0, 6: -1, 0: -2 }[dia] ?? 5 - dia;
  const primerViernes = sumarDias(hoy, desplazamiento);
  return Array.from({ length: n }, (_, i) => {
    const viernes = sumarDias(primerViernes, 7 * i);
    const domingo = sumarDias(viernes, 2);
    return { id: viernes, viernes, sabado: sumarDias(viernes, 1), domingo, etiqueta: etiquetaRango(viernes, domingo) };
  });
}
