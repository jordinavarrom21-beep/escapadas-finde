/**
 * Ofertas para ir con niños: si los niños van gratis, con descuento o a precio reducido,
 * y si el plan es apto para ellos. Por reglas, del título, la descripción, el precio
 * publicado y las etiquetas de la web («1er niño gratis», «niños 60 % de descuento»,
 * «tarifa infantil», «miniclub»). Lo que se niega («no se admiten niños») o un sitio
 * «solo adultos» no cuenta.
 *
 * `ninos` es null si no hay nada de niños; si no, `{ventaja, descuento, detalle}`:
 * - `ventaja`: 'gratis', 'descuento' (con `descuento` en %), 'reducido' (tarifa infantil
 *   sin porcentaje) o null (apta para niños, sin precio especial).
 * - `detalle`: el texto para la ficha («1 niño gratis (de 2 a 16 años)»), o null.
 */
import { normalizarTexto } from '../util/xml.js';

const NINO = '(?:nin[oa]s?|peques?|menores|infantil(?:es)?|bebes?|kids?|hijos?)';
const EDAD = '(?:\\s*\\(?\\s*(?:de \\d{1,2} a \\d{1,2}|de \\d{1,2}(?= anos)|hasta(?: los)? \\d{1,2}|menores de \\d{1,2}|< ?\\d{1,2})(?: anos)?\\s*\\)?)?';
const CUANTOS = '(?:(1er|1o|primer|un|una|1|2|dos|2o|segundo|los|las|sus|tus) )?';
const GRATIS = '(?:gratis|gratuit[oa]s?|free|incluid[oa]s?|sin coste|no pagan?|pagan? 0 ?€?)';
// Lo que puede ir entre el niño y el «gratis»: «duermen y comen», «en el mismo régimen»…
const RELLENO = '(?:(?:duerme|duermen|come|comen|y|viaja|viajan|entra|entran|va|van|se alojan?|alojados?|comparten habitacion|en (?:la|su) misma habitacion|en el mismo regimen|con (?:los|sus) padres|compartiendo(?: habitacion)?|totalmente|completamente|siempre)\\s)*';

const PATRONES_GRATIS = [
  new RegExp(`\\b${CUANTOS}${NINO}${EDAD} ${RELLENO}(${GRATIS})\\b`),
  // Aquí sin «incluido»: «desayuno incluido para niños» no es que vayan gratis.
  new RegExp(`\\b()(?:gratis|gratuit[oa]s?|free|sin coste) (?:para |a )?(?:el |los |las |un |1 |tus |sus )?(?:primer |1er )?${NINO}${EDAD}`),
];
const PATRONES_DESCUENTO = [
  // «niños 60 % de descuento», «niños -50%», «niños con un 30 %»
  new RegExp(`\\b${CUANTOS}${NINO}${EDAD} (?:con |al |a )?(?:un |el )?-? ?(\\d{1,3}) ?%`),
  // «-50% niños», «50 % de descuento para niños», «30 % dto. al primer niño»
  new RegExp(`-? ?(\\d{1,3}) ?% (?:de )?(?:descuento |dto\\.? |dcto\\.? |rebaja )?(?:para |a |al |en )?(?:el |los |las |tus |sus )?(?:primer |1er |segundo )?${NINO}\\b`),
];
const MITAD = new RegExp(`\\b${NINO}${EDAD} (?:pagan |a |al )?(?:la )?mitad(?: de precio)?\\b|\\bmitad de precio (?:para |a )?(?:los )?${NINO}`);
const REDUCIDO = new RegExp(`\\b(?:precios?|tarifas?|entradas?|billetes?|descuentos?) (?:reducid[oa]s? |especial(?:es)? )?(?:para |de |a )?(?:los |las )?(?:${NINO}|familias)\\b|\\b(?:tarifas?|entradas?|precios?|billetes?) infantil(?:es)?\\b`);

/** Señales de que el plan es para ir con niños (sin tildes). */
const APTO = new RegExp([
  '\\bnin[oa]s?\\b', '\\binfantil(?:es)?\\b', '\\bmini ?club\\b', '\\bkids?\\b', '\\bpeques\\b', '\\bparque acuatico\\b',
  '\\btoboganes\\b', '\\ben familia\\b', '\\bpara (?:toda )?la familia\\b', '\\bfamilias\\b', '\\bzoo\\b', '\\bacuario\\b',
  '\\bgranja escuela\\b', '\\bbusqueda del tesoro\\b', '\\bjuego de pistas\\b', '\\bjuguetes?\\b',
  '\\b(?:escapada|viajes?|plan|vacaciones|habitacion(?:es)?|doble|suite|grupos?|ocio|ambiente|parque|actividad(?:es)?) familiar(?:es)?\\b',
].join('|'));

/** «No se admiten niños», «sin niños ni mascotas»: lo negado no cuenta. */
const NEGACIONES = /\b(?:no|sin)\s+(?:se\s+)?(?:admite[ns]?|acepta[ns]?|permite[ns]?)?\s*(?:ninos?|menores|mascotas?|perros?|animales)(?:\s*(?:,|ni|y|o)\s*(?:ninos?|menores|mascotas?|perros?|animales))*\b|\bno (?:apto|recomendado|apta|recomendada) para (?:ninos|menores)\b/g;
const SOLO_ADULTOS = /\b(?:solo (?:para )?adultos|adults only|mayores de 1[68] anos)\b/;
/** «Suite junior», «habitación infantil» no dicen nada de precios: solo «junior» se ignora. */
const RUIDO = /\bsuite junior\b/g;

function textoDe(oferta) {
  const { titulo, descripcion, precioTexto, etiquetas = [] } = oferta;
  return normalizarTexto([titulo, descripcion, precioTexto, ...etiquetas].filter(Boolean).join(' · '))
    .replace(/\s+/g, ' ').replace(RUIDO, ' ').replace(NEGACIONES, ' ');
}

/** «de 2 a 16 anos» → «de 2 a 16 años». */
const edadDe = (texto) => {
  const edad = texto.match(/(de \d{1,2} a \d{1,2}|hasta(?: los)? \d{1,2}|menores de \d{1,2})(?: anos)?/)?.[1];
  return edad ? ` (${edad.replace('menores de', 'menos de')} años)` : '';
};
const esUno = (cuantos) => ['1er', '1o', 'primer', 'un', 'una', '1'].includes(cuantos);

/**
 * Qué ofrece la oferta a los niños, o null si nada.
 * @param {import('../modelo.js').Oferta} oferta
 * @returns {{ventaja: 'gratis'|'descuento'|'reducido'|null, descuento: number|null, detalle: string|null}|null}
 */
export function detectarNinos(oferta) {
  if (oferta.tipo === 'vuelo') return null;
  const texto = textoDe(oferta);
  if (SOLO_ADULTOS.test(texto)) return null;
  for (const patron of PATRONES_GRATIS) {
    const m = texto.match(patron);
    if (!m) continue;
    const cuantos = m[1] || m[0].match(/\b(1er|primer|un|1)\b/)?.[1];
    // «2 adultos y 2 niños incluidos» es el precio de la familia; «1 niño incluido», que no paga.
    if (/^incluid/.test(m[2] ?? '') && !esUno(cuantos)) continue;
    const quien = esUno(cuantos) ? '1 niño' : ['2', 'dos', '2o', 'segundo'].includes(cuantos) ? (cuantos === '2' || cuantos === 'dos' ? '2 niños' : 'El 2.º niño') : 'Niños';
    return { ventaja: 'gratis', descuento: null, detalle: `${quien} gratis${edadDe(m[0])}` };
  }
  for (const patron of PATRONES_DESCUENTO) {
    const m = texto.match(patron);
    const pct = Number(m?.at(-1));
    if (!m || !(pct >= 5 && pct <= 100)) continue;
    if (pct === 100) return { ventaja: 'gratis', descuento: null, detalle: `Niños gratis${edadDe(m[0])}` };
    return { ventaja: 'descuento', descuento: pct, detalle: `Niños con un ${pct} % de descuento${edadDe(m[0])}` };
  }
  const mitad = texto.match(MITAD);
  if (mitad) return { ventaja: 'descuento', descuento: 50, detalle: `Niños a mitad de precio${edadDe(mitad[0])}` };
  if (REDUCIDO.test(texto)) return { ventaja: 'reducido', descuento: null, detalle: 'Precio reducido para niños' };
  if (APTO.test(texto) || (oferta.temas ?? []).includes('parques')) return { ventaja: null, descuento: null, detalle: null };
  return null;
}

/** Rellena `ninos` (se recalcula en cada escaneo) y, si es para niños, el tema «familia». */
export function aplicarNinos(oferta) {
  oferta.ninos = detectarNinos(oferta);
  if (oferta.ninos && !oferta.temas.includes('familia')) oferta.temas = [...oferta.temas, 'familia'];
  return oferta;
}
