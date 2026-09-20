/**
 * ¿Es cara o barata esta oferta comparada con las parecidas? Para cada oferta se
 * busca su grupo de comparación, se calcula la mediana del grupo y cuánto se
 * ahorra respecto a ella. Sin red: solo mira las ofertas que ya están en memoria.
 *
 * Grupos, de más preciso a menos:
 *   1. Vuelos, por ruta: `vuelo:BCN-OPO` (se comparan los precios tal cual).
 *   2. Escapadas y hoteles, por tema principal y zona: `escapada:spa:girona`
 *      (se compara el precio por persona y noche).
 *   3. Respaldo por tipo: `tipo:escapada` (se comparan los precios tal cual).
 * Un grupo solo sirve si reúne al menos `MINIMO_GRUPO` ofertas; si ninguno llega,
 * la oferta se queda sin referencia.
 */
import { TEMAS } from '../modelo.js';
import { normalizarTexto } from '../util/xml.js';
import { precioPorPersonaNoche } from './puntuacion.js';

const MINIMO_GRUPO = 5;
/** El orden de `TEMAS` decide cuál es el tema principal de una oferta con varios. */
const ORDEN_TEMAS = TEMAS.map((tema) => tema.id);

/** Mediana de una lista de números (no la modifica). */
export function mediana(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

const redondear = (numero, decimales) => Number(numero.toFixed(decimales));
const esPrecio = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor > 0;

/** Precio por persona y noche, lo haya calculado ya `puntuacion.js` o no. */
const porNoche = (oferta) => oferta.precioNoche ?? precioPorPersonaNoche(oferta);

const zonaDe = (lugar) => {
  const zona = normalizarTexto(lugar?.region || lugar?.pais || '').trim();
  return zona || null;
};

const temaPrincipal = (oferta) => ORDEN_TEMAS.find((tema) => oferta.temas.includes(tema)) ?? null;

/** Grupo más preciso al que puede pertenecer la oferta, o null. */
function grupoPreciso(oferta) {
  if (oferta.tipo === 'vuelo') {
    const { origen, destino } = oferta.vuelo ?? {};
    return origen && destino && esPrecio(oferta.precio)
      ? { grupo: `vuelo:${origen}-${destino}`, valor: oferta.precio }
      : null;
  }
  const tema = temaPrincipal(oferta);
  const zona = zonaDe(oferta.lugar);
  const valor = porNoche(oferta);
  return tema && zona && esPrecio(valor) ? { grupo: `escapada:${tema}:${zona}`, valor } : null;
}

// Un billete suelto (bus, tren o ferry) no se compara con estancias: su precio no es por noche.
const esBillete = (oferta) =>
  oferta.tipo !== 'vuelo' && ['bus', 'tren', 'ferry'].includes(oferta.transporte) && porNoche(oferta) == null;

/** Grupos candidatos de una oferta, del más preciso al de respaldo. */
function candidatos(oferta) {
  if (!esPrecio(oferta.precio)) return [grupoPreciso(oferta)].filter(Boolean);
  const grupo = esBillete(oferta) ? `transporte:${oferta.transporte}` : `tipo:${oferta.tipo}`;
  return [grupoPreciso(oferta), { grupo, valor: oferta.precio }].filter(Boolean);
}

function referenciaDe({ grupo, valor }, valores) {
  const centro = mediana(valores);
  return {
    mediana: redondear(centro, 2),
    ahorroPct: Math.round(((centro - valor) / centro) * 100),
    grupo,
    n: valores.length,
  };
}

/**
 * Rellena `referencia` en todas las ofertas: `{mediana, ahorroPct, grupo, n}`, o
 * null si no hay un grupo con suficientes ofertas con las que compararla.
 * `ahorroPct` positivo significa más barata que la mediana de su grupo.
 * @param {import('../modelo.js').Oferta[]} ofertas
 */
export function calcularReferencia(ofertas) {
  const valoresPorGrupo = new Map();
  const candidatosPorOferta = new Map();

  for (const oferta of ofertas) {
    const lista = candidatos(oferta);
    candidatosPorOferta.set(oferta, lista);
    for (const { grupo, valor } of lista) {
      if (!valoresPorGrupo.has(grupo)) valoresPorGrupo.set(grupo, []);
      valoresPorGrupo.get(grupo).push(valor);
    }
  }

  for (const oferta of ofertas) {
    const elegido = candidatosPorOferta.get(oferta)
      .find(({ grupo }) => valoresPorGrupo.get(grupo).length >= MINIMO_GRUPO);
    oferta.referencia = elegido ? referenciaDe(elegido, valoresPorGrupo.get(elegido.grupo)) : null;
  }
  return ofertas;
}
