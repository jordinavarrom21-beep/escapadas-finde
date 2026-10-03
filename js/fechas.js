/**
 * Fechas en hora de Madrid para el panel. Los días son 'YYYY-MM-DD' y se opera
 * con aritmética de calendario pura, igual que src/util/fechas.js (el panel se
 * publica solo con site/, así que no puede importar de src/).
 */

export const ZONA = 'Europe/Madrid';
/** Hora del viernes a partir de la cual ya «es finde». */
export const INICIO_FINDE = { hora: 15, minuto: 0 };

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA_MS = 86_400_000;

const formatoPartes = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Día y hora de Madrid: {dia: 'YYYY-MM-DD', hora, minuto, segundo, diaSemana (0 = domingo)}. */
export function partesMadrid(fecha = new Date()) {
  const p = Object.fromEntries(formatoPartes.formatToParts(fecha).map(({ type, value }) => [type, value]));
  const dia = `${p.year}-${p.month}-${p.day}`;
  return { dia, hora: Number(p.hour), minuto: Number(p.minute), segundo: Number(p.second), diaSemana: diaSemana(dia) };
}

/** Día de Madrid 'YYYY-MM-DD' de un instante (Date o ISO). */
export function fechaLocal(fecha = new Date()) {
  return partesMadrid(new Date(fecha)).dia;
}

/** 'HH:MM' en hora de Madrid de un instante ISO. */
export function horaMadrid(iso) {
  const { hora, minuto } = partesMadrid(new Date(iso));
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

function aUtc(iso) {
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

export function sumarDias(iso, dias) {
  return new Date(aUtc(iso) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(iso) {
  return new Date(aUtc(iso)).getUTCDay();
}

export function diasEntre(desde, hasta) {
  return Math.round((aUtc(hasta) - aUtc(desde)) / DIA_MS);
}

/** '2026-10-16' → 'vie 16 oct'. */
export function etiquetaDia(iso) {
  const [, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return `${DIAS[diaSemana(iso)]} ${dia} ${MESES[mes - 1]}`;
}

/** '9–12 oct' o '30 oct – 1 nov'. */
export function etiquetaRango(desde, hasta) {
  const [, mesDesde, diaDesde] = desde.split('-').map(Number);
  const [, mesHasta, diaHasta] = hasta.split('-').map(Number);
  return mesDesde === mesHasta
    ? `${diaDesde}–${diaHasta} ${MESES[mesHasta - 1]}`
    : `${diaDesde} ${MESES[mesDesde - 1]} – ${diaHasta} ${MESES[mesHasta - 1]}`;
}

/** 'HH:MM' de una fecha-hora local 'YYYY-MM-DDTHH:mm:ss'. */
export const horaDe = (fechaHora) => fechaHora?.slice(11, 16) ?? '';

/** Viernes del fin de semana al que pertenece un día (de lunes a jueves, el siguiente). */
export function viernesDe(iso) {
  const dia = diaSemana(iso);
  return sumarDias(iso, { 5: 0, 6: -1, 0: -2 }[dia] ?? 5 - dia);
}

/** Los próximos `n` findes; si hoy es viernes, sábado o domingo, el primero es el actual. */
export function findesProximos(n, ahora = new Date()) {
  const primero = viernesDe(fechaLocal(ahora));
  return Array.from({ length: n }, (_, i) => {
    const viernes = sumarDias(primero, 7 * i);
    const domingo = sumarDias(viernes, 2);
    return { id: viernes, viernes, sabado: sumarDias(viernes, 1), domingo, etiqueta: etiquetaRango(viernes, domingo) };
  });
}

/**
 * ¿Es finde (del viernes a las 15:00 al domingo) en Madrid? Si no, cuánto falta.
 * La cuenta usa la hora de pared de Madrid (puede desviarse 1 h en un cambio de hora).
 * @returns {{esFinde: boolean, faltaMs: number}}
 */
export function estadoFinde(ahora = new Date()) {
  const { hora, minuto, segundo, diaSemana: dia } = partesMadrid(ahora);
  const minutosDia = hora * 60 + minuto;
  const inicio = INICIO_FINDE.hora * 60 + INICIO_FINDE.minuto;
  if (dia === 6 || dia === 0 || (dia === 5 && minutosDia >= inicio)) return { esFinde: true, faltaMs: 0 };
  const dias = (5 - dia + 7) % 7;
  return { esFinde: false, faltaMs: ((dias * 1440 + inicio - minutosDia) * 60 - segundo) * 1000 };
}

/** Primer puente que aún no ha terminado (o null). */
export function proximoPuente(puentes = [], hoy) {
  return [...puentes].filter((p) => p.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde))[0] ?? null;
}
