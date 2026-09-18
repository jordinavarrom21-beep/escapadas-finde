/**
 * Festivos (nacionales, de la comunidad y locales), puentes y asignación de cada
 * oferta a su fin de semana o puente.
 */
import { diaSemana, etiquetaRango, sumarDias } from '../util/fechas.js';

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const PRIORIDAD_AMBITO = { nacional: 0, autonomico: 1, local: 2 };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Nager.at da algunos nombres locales en inglés. */
const TRADUCCIONES = { 'Feast of Saint Stephen': 'Sant Esteve', "St. Stephen's Day": 'Sant Esteve' };

const urlNager = (anio) => `https://date.nager.at/api/v3/PublicHolidays/${anio}/ES`;

function deNager(datos, comunidad) {
  return datos
    .filter((d) => d.global || d.counties?.includes(comunidad))
    .map((d) => ({ fecha: d.date, nombre: TRADUCCIONES[d.localName] ?? d.localName, ambito: d.global ? 'nacional' : 'autonomico' }));
}

/** «A», «A y B», «A, B y C» (con «e» delante de palabras que empiezan por «i»). */
function enumerar(nombres) {
  if (nombres.length < 2) return nombres.join('');
  const ultimo = nombres.at(-1);
  const conjuncion = /^h?i[^aeiou]/i.test(ultimo) ? 'e' : 'y';
  return `${nombres.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}

async function festivosNager(ctx, anio) {
  const clave = `festivos:${anio}`;
  const ahora = ctx.ahora.getTime();
  const guardados = ctx.cache.obtener(clave, SIETE_DIAS_MS, ahora);
  if (guardados) return guardados;
  try {
    const datos = await ctx.http.json(urlNager(anio));
    if (!Array.isArray(datos)) throw new Error('respuesta inesperada de Nager.at');
    ctx.cache.guardar(clave, datos, ahora);
    return datos;
  } catch (error) {
    ctx.log(`No se han podido actualizar los festivos de ${anio}: ${error.message}`);
    return ctx.cache.obtener(clave) ?? [];
  }
}

/**
 * Festivos de los años indicados: los de Nager.at (nacionales y de
 * `ajustes.puentes.comunidad`) más `ajustes.puentes.festivosLocales`, sin fechas
 * repetidas y ordenados.
 * @returns {Promise<{fecha: string, nombre: string, ambito: 'nacional'|'autonomico'|'local'}[]>}
 */
export async function obtenerFestivos(ctx, anios) {
  const { comunidad, festivosLocales = [] } = ctx.ajustes.puentes;
  const lista = [];
  for (const anio of anios) lista.push(...deNager(await festivosNager(ctx, anio), comunidad));
  lista.push(...festivosLocales
    .filter((f) => anios.includes(Number(f.fecha.slice(0, 4))))
    .map((f) => ({ fecha: f.fecha, nombre: f.nombre, ambito: 'local' })));
  const porFecha = new Map();
  for (const festivo of lista.sort((a, b) => PRIORIDAD_AMBITO[a.ambito] - PRIORIDAD_AMBITO[b.ambito])) {
    if (!porFecha.has(festivo.fecha)) porFecha.set(festivo.fecha, festivo);
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Puentes entre `desde` y `hasta`: bloques de 3 o más días libres seguidos (fines de
 * semana, festivos y el día puente entre un festivo en martes o jueves y el fin de
 * semana) que contienen al menos un festivo.
 */
export function calcularPuentes(festivos, { desde, hasta }) {
  const porFecha = new Map(festivos.map((f) => [f.fecha, f]));
  const diasPuente = new Set(festivos.flatMap((f) => {
    const dia = diaSemana(f.fecha);
    if (dia === 2) return [sumarDias(f.fecha, -1)];
    if (dia === 4) return [sumarDias(f.fecha, 1)];
    return [];
  }));
  const libre = (fecha) => [0, 6].includes(diaSemana(fecha)) || porFecha.has(fecha) || diasPuente.has(fecha);

  const puentes = [];
  let fecha = sumarDias(desde, -3);
  const limite = sumarDias(hasta, 3);
  while (fecha <= limite) {
    if (!libre(fecha)) { fecha = sumarDias(fecha, 1); continue; }
    const inicio = fecha;
    while (libre(sumarDias(fecha, 1))) fecha = sumarDias(fecha, 1);
    const bloque = { desde: inicio, hasta: fecha };
    const festivosBloque = festivos.filter((f) => f.fecha >= bloque.desde && f.fecha <= bloque.hasta);
    const dias = Math.round((Date.parse(bloque.hasta) - Date.parse(bloque.desde)) / 86_400_000) + 1;
    if (dias >= 3 && festivosBloque.length && bloque.hasta >= desde && bloque.desde <= hasta) {
      puentes.push({
        id: bloque.desde,
        nombre: enumerar(festivosBloque.map((f) => f.nombre)),
        desde: bloque.desde,
        hasta: bloque.hasta,
        dias,
        festivos: festivosBloque,
        diasPuente: [...diasPuente].filter((d) => d >= bloque.desde && d <= bloque.hasta && !porFecha.has(d)).sort(),
        salidas: [sumarDias(bloque.desde, -1), bloque.desde],
        vuelta: bloque.hasta,
        etiqueta: etiquetaRango(bloque.desde, bloque.hasta),
      });
    }
    fecha = sumarDias(fecha, 1);
  }
  return puentes;
}

// «Puente de Octubre» (etiqueta de algunas webs) → el primer puente de ese mes.
function puentePorEtiqueta(etiquetas, puentes) {
  for (const etiqueta of etiquetas) {
    const mes = MESES.indexOf(etiqueta.toLowerCase().match(/puente de (\p{L}+)/u)?.[1]);
    if (mes < 0) continue;
    const puente = puentes.find((p) => Number(p.desde.slice(5, 7)) === mes + 1 || Number(p.hasta.slice(5, 7)) === mes + 1);
    if (puente) return puente.id;
  }
  return null;
}

/**
 * Fin de semana y puente a los que pertenece una oferta según sus fechas (o, sin
 * fechas, según etiquetas como «Puente de Octubre»).
 * @returns {{findeId: string|null, puenteId: string|null}}
 */
export function asignarFechas(oferta, findes, puentes) {
  const salida = oferta.fechas.salida?.slice(0, 10) ?? null;
  const vuelta = oferta.fechas.vuelta?.slice(0, 10) ?? null;
  if (!salida) return { findeId: null, puenteId: puentePorEtiqueta(oferta.etiquetas, puentes) };
  const finde = findes.find((f) => salida >= f.viernes && salida <= f.domingo);
  const puente = puentes.find((p) =>
    salida >= p.salidas[0] && salida <= p.hasta && (!vuelta || (vuelta >= p.desde && vuelta <= sumarDias(p.hasta, 1))));
  return { findeId: finde?.id ?? null, puenteId: puente?.id ?? null };
}
