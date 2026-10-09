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
/** «del 13 al 15 (de) diciembre», «13-15 diciembre», «del 30 de octubre al 2 de noviembre». */
const RANGO = new RegExp(`\\b(?:del?\\s+)?(\\d{1,2})(?:\\s+(?:de\\s+)?${MES})?\\s*(?:al|a|-|–)\\s*(\\d{1,2})\\s+(?:de\\s+)?${MES}\\b`, 'g');
/** Lo que hace de las fechas un ejemplo, justo antes. */
const EJEMPLO = /(?:ejemplo|ej\.|p\.\s?ej|como|tipo|varias fechas)[^.]{0,20}$/;
/** Más de esto no es una escapada con fechas cerradas, es una ventana de fechas. */
const MAXIMO_DIAS = 21;

const dos = (n) => String(n).padStart(2, '0');

/** El primer año en que ese día aún no ha pasado. */
function conAnio(mes, dia, hoy) {
  const anio = Number(hoy.slice(0, 4));
  const fecha = `${anio}-${dos(mes)}-${dos(dia)}`;
  return fecha >= hoy ? fecha : `${anio + 1}-${dos(mes)}-${dos(dia)}`;
}

const valida = (mes, dia) => mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;

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
    const [, diaIda, mesIdaTexto, diaVuelta, mesVueltaTexto] = m;
    const mesVuelta = MESES[mesVueltaTexto];
    const mesIda = mesIdaTexto ? MESES[mesIdaTexto] : mesVuelta;
    if (!valida(mesIda, Number(diaIda)) || !valida(mesVuelta, Number(diaVuelta))) continue;
    const salida = conAnio(mesIda, Number(diaIda), hoy);
    // La vuelta, el primer día así a partir de la salida (del 30 de diciembre al 2 de enero).
    let vuelta = `${salida.slice(0, 4)}-${dos(mesVuelta)}-${dos(Number(diaVuelta))}`;
    if (vuelta < salida) vuelta = `${Number(salida.slice(0, 4)) + 1}${vuelta.slice(4)}`;
    if (vuelta <= salida || vuelta > sumarDias(salida, MAXIMO_DIAS)) continue;
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
