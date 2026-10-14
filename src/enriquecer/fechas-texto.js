/**
 * Fechas cerradas que solo vienen escritas en el texto: «Desde Madrid del 13 al 15 diciembre»,
 * «Sería del 22 al 24 de Enero», «del 30 de octubre al 2 de noviembre». Sin esto, esas ofertas
 * salían como «Fechas flexibles» en cualquier finde. No cuentan las que van de ejemplo («Ejemplo
 * del 23 al 29 noviembre», «por ejemplo…»): son una de varias fechas posibles.
 */
import { normalizarTexto } from '../util/xml.js';
import { sumarDias } from '../util/fechas.js';

const MESES = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sep: 9, sept: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};
const MES = `(${Object.keys(MESES).sort((a, b) => b.length - a.length).join('|')})\\.?`;
/** «del 13 al 15 (de) diciembre», «13-15 diciembre», «del 30 de octubre al 2 de noviembre», «… de 2027». */
const RANGO = new RegExp(`\\b(?:del?\\s+)?(\\d{1,2})(?:\\s+(?:de\\s+)?${MES})?\\s*(?:al|a|-|–)\\s*(\\d{1,2})\\s+(?:de\\s+)?${MES}(?:\\s+(?:de\\s+|del\\s+)?(20\\d{2}))?\\b`, 'g');
/** Lo que hace de las fechas un ejemplo, justo antes. */
const EJEMPLO = /(?:ejemplo|ej\.|p\.\s?ej|como|tipo|varias fechas)[^.]{0,20}$/;
/** Más de esto no es una escapada con fechas cerradas, es una ventana de fechas. */
const MAXIMO_DIAS = 21;

const dos = (n) => String(n).padStart(2, '0');

/**
 * Hasta cuánto puede haber pasado una fecha sin año para ser de este año. «Del 13 al 15 de
 * octubre» leído el 14 o el 20 de octubre ya ha empezado o pasado (y la oferta se retira por
 * pasada): no es del año que viene. Las ofertas con fechas en el texto se publican con días o
 * meses de antelación (de 1 semana a 5 meses en las que hay ahora), nunca con más de 10.
 */
const DIAS_PASADA = 60;

/** El año de ese día: el primero en que no pasó hace más de `DIAS_PASADA` días. */
function conAnio(mes, dia, hoy) {
  const anio = Number(hoy.slice(0, 4));
  const desde = sumarDias(hoy, -DIAS_PASADA);
  return [anio - 1, anio, anio + 1].map((a) => `${a}-${dos(mes)}-${dos(dia)}`).find((fecha) => fecha >= desde);
}

/** ¿Existe ese día? «30 de febrero» o «31 de noviembre» no (y daban otro día de la semana). */
const existe = (fecha) => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return mes >= 1 && mes <= 12 && dia >= 1 && new Date(Date.UTC(anio, mes - 1, dia)).getUTCDate() === dia;
};

/**
 * Las fechas de un texto ({salida, vuelta} 'YYYY-MM-DD') o null si no dice un único periodo.
 * @param {string} texto
 * @param {string} hoy 'YYYY-MM-DD'
 */
export function fechasDeTexto(texto, hoy) {
  const normal = normalizarTexto(texto ?? '');
  const encontradas = [];
  for (const m of normal.matchAll(RANGO)) {
    if (EJEMPLO.test(normal.slice(Math.max(0, m.index - 30), m.index))) continue;
    const [, diaIda, mesIdaTexto, diaVuelta, mesVueltaTexto, anioTexto] = m;
    const mesVuelta = MESES[mesVueltaTexto];
    const mesIda = mesIdaTexto ? MESES[mesIdaTexto] : mesVuelta;
    // Con el año escrito («… de diciembre de 2026»), ese; si no, el que toca.
    const salida = anioTexto
      ? `${Number(anioTexto) - (mesIda > mesVuelta ? 1 : 0)}-${dos(mesIda)}-${dos(Number(diaIda))}`
      : conAnio(mesIda, Number(diaIda), hoy);
    // La vuelta, el primer día así a partir de la salida (del 30 de diciembre al 2 de enero).
    let vuelta = `${salida.slice(0, 4)}-${dos(mesVuelta)}-${dos(Number(diaVuelta))}`;
    if (vuelta < salida) vuelta = `${Number(salida.slice(0, 4)) + 1}${vuelta.slice(4)}`;
    if (!existe(salida) || !existe(vuelta) || vuelta <= salida || vuelta > sumarDias(salida, MAXIMO_DIAS)) continue;
    encontradas.push({ salida, vuelta });
  }
  // Varias fechas distintas («del 3 al 5 o del 10 al 12») no son unas fechas cerradas.
  const distintas = new Set(encontradas.map((f) => `${f.salida}/${f.vuelta}`));
  return distintas.size === 1 ? encontradas[0] : null;
}

/**
 * Pone las fechas del título (o, si no las dice, de la descripción) a las ofertas con
 * alojamiento que no traen fechas. Los vuelos, actividades y billetes, no.
 * @param {import('../modelo.js').Oferta} oferta
 */
export function aplicarFechasDelTexto(oferta, hoy) {
  if (oferta.fechas?.salida || !['paquete', 'escapada', 'hotel'].includes(oferta.tipo)) return oferta;
  const fechas = fechasDeTexto(oferta.titulo, hoy) ?? fechasDeTexto(oferta.descripcion, hoy);
  if (fechas) oferta.fechas = { ...oferta.fechas, ...fechas };
  return oferta;
}
