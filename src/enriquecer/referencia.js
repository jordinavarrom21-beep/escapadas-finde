/**
 * ¿Es cara o barata esta oferta comparada con las parecidas? Para cada oferta se
 * busca su grupo de comparación, se calcula la mediana del grupo y cuánto se
 * ahorra respecto a ella. Sin red: solo mira las ofertas que ya están en memoria.
 *
 * Grupos, de más preciso a menos:
 *   1. Vuelos, por ruta y unidad: `vuelo:BCN-OPO:i/v` (ida y vuelta no se compara con solo ida).
 *   2. Escapadas y hoteles, por tema principal y zona: `escapada:spa:girona`
 *      (se compara el precio por persona y noche).
 *   3. Respaldo: por persona y noche si se puede calcular (`noche:hotel`); si no, por
 *      tipo y unidad (`tipo:escapada:total`), para no comparar un total de 7 noches
 *      con un precio por noche.
 * Un grupo solo sirve si reúne al menos `MINIMO_GRUPO` ofertas; si ninguno llega,
 * la oferta se queda sin referencia.
 */
import { TEMAS } from '../modelo.js';
import { normalizarTexto } from '../util/xml.js';
import { precioPorPersonaNoche } from './puntuacion.js';

/** Con menos ofertas, la mediana del grupo no dice qué es «lo normal». */
export const MINIMO_GRUPO = 15;
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

// La provincia, si se sabe (zona.js): así «Costa Brava», «Baix Empordà» y «Girona» son el mismo grupo.
const zonaDe = (lugar) => {
  const zona = normalizarTexto(lugar?.provincia || lugar?.region || lugar?.pais || '').trim();
  return zona || null;
};

const temaPrincipal = (oferta) => ORDEN_TEMAS.find((tema) => oferta.temas.includes(tema)) ?? null;

/** Grupo más preciso al que puede pertenecer la oferta, o null. */
function grupoPreciso(oferta) {
  if (oferta.tipo === 'vuelo') {
    const { origen, destino } = oferta.vuelo ?? {};
    return origen && destino && esPrecio(oferta.precio)
      ? { grupo: `vuelo:${origen}-${destino}:${oferta.unidad ?? '-'}`, valor: oferta.precio }
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

/**
 * Grupos candidatos de una oferta, del más preciso al de respaldo. Las actividades no
 * tienen: una entrada a un museo, un free tour y un paseo en barco no son comparables.
 */
function candidatos(oferta) {
  if (oferta.tipo === 'actividad') return [];
  if (!esPrecio(oferta.precio)) return [grupoPreciso(oferta)].filter(Boolean);
  const noche = oferta.tipo === 'vuelo' ? null : porNoche(oferta);
  const respaldo = esPrecio(noche)
    ? { grupo: `noche:${oferta.tipo}`, valor: noche }
    : { grupo: `${esBillete(oferta) ? `transporte:${oferta.transporte}` : `tipo:${oferta.tipo}`}:${oferta.unidad ?? 'sin-unidad'}`, valor: oferta.precio };
  return [grupoPreciso(oferta), respaldo].filter(Boolean);
}

const PLURAL_TIPO = { escapada: 'escapadas', hotel: 'alojamientos', paquete: 'paquetes', crucero: 'cruceros', vuelo: 'vuelos' };
const UNIDAD = { pp: 'por persona', 'pp/noche': 'por persona y noche', total: 'en total', 'i/v': 'ida y vuelta', noche: 'por noche', trayecto: 'por trayecto' };
const TRANSPORTE = { bus: 'autobús', tren: 'tren', ferry: 'ferry' };
/** «escapadas románticas», «escapadas de playa»: cómo se dice cada tema detrás de «escapadas». */
const ESCAPADAS_DE = {
  spa: 'de relax y spa', romantico: 'románticas', rural: 'rurales', playa: 'de playa', gastronomia: 'gastronómicas',
  familia: 'en familia', ciudad: 'de ciudad', aventura: 'de aventura y nieve', parques: 'a parques temáticos',
  eventos: 'de eventos', mascotas: 'con mascotas', singular: 'en alojamientos singulares',
};
const NOMBRE_TEMA = new Map(TEMAS.map((tema) => [tema.id, ESCAPADAS_DE[tema.id] ?? `de ${tema.nombre.toLowerCase()}`]));

/**
 * Con qué se compara, en palabras: «escapadas de relax y spa en Girona, por persona y
 * noche», «vuelos BCN–OPO, ida y vuelta», «alojamientos, por persona y noche».
 */
export function describirGrupo(grupo, oferta) {
  const [clase, a, b] = grupo.split(':');
  if (clase === 'vuelo') return `vuelos ${a.replace('-', '–')}${UNIDAD[b] ? `, ${UNIDAD[b]}` : ''}`;
  if (clase === 'escapada') {
    const zona = oferta.lugar?.provincia || oferta.lugar?.region || oferta.lugar?.pais || b;
    return `escapadas ${NOMBRE_TEMA.get(a) ?? a} en ${zona}, por persona y noche`;
  }
  if (clase === 'noche') return `${PLURAL_TIPO[a] ?? a}, por persona y noche`;
  if (clase === 'transporte') return `billetes de ${TRANSPORTE[a] ?? a}${UNIDAD[b] ? `, ${UNIDAD[b]}` : ''}`;
  if (clase === 'tipo') return `${a === 'vuelo' ? 'chollos de vuelos' : PLURAL_TIPO[a] ?? a}${UNIDAD[b] ? `, ${UNIDAD[b]}` : ''}`;
  return 'ofertas parecidas';
}

function referenciaDe({ grupo, valor }, valores, oferta) {
  const centro = mediana(valores);
  return {
    mediana: redondear(centro, 2),
    ahorroPct: Math.round(((centro - valor) / centro) * 100),
    grupo,
    descripcion: describirGrupo(grupo, oferta),
    n: valores.length,
  };
}

/**
 * Rellena `referencia` en todas las ofertas: `{mediana, ahorroPct, grupo, descripcion, n}`, o
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
    oferta.referencia = elegido ? referenciaDe(elegido, valoresPorGrupo.get(elegido.grupo), oferta) : null;
  }
  return ofertas;
}
