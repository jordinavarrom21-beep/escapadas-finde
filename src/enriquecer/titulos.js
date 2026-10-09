/**
 * Títulos limpios para las listas: muchas webs de chollos los escriben para llamar la atención
 * («¡CANTABRIA te espera! … HOTEL 3* con DESAYUNO», «Mercados navideños en Riga🎄», «… desde 15€
 * pp. ¿A qué esperas?»). Aquí se quitan los emojis, las coletillas de venta y el precio (la
 * tarjeta ya lo da, comparable), y las palabras en mayúsculas pasan a escribirse normal: las
 * comunes en minúscula y los nombres propios con mayúscula inicial. Las siglas cortas (BCN,
 * SPA, AVE) se quedan. El título tal cual lo publica la web se guarda en `tituloOriginal`.
 */
import { normalizarTexto } from '../util/xml.js';

/** Emojis y símbolos decorativos; las estrellas de categoría (★) se quedan. */
// Por partes (no en una clase de caracteres: los combinables se leerían mal): el pictograma,
// el selector de variante, el unidor, las banderas y los tonos de piel.
const EMOJIS = /(?!★)\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]/gu;

/** Coletillas de venta que no dicen nada de la oferta. */
const COLETILLAS = [
  /¿?\s*a\s+qu[eé]\s+esperas\s*\?*!*/giu,
  /¡?\s*no\s+te\s+lo\s+pierdas\s*!*/giu,
  /¡?\s*corre(?:\s*,?\s*que\s+vuelan?)?\s*!+/giu,
  /¡\s*(?:super\s*)?chollo(?:azo)?s?\s*!/giu,
  /¡?\s*[uú]ltimas\s+plazas\s*!*/giu,
  // «P.P (Min 2.p)», «(mín. 2 pers.)»: es el precio por persona, que ya dice la tarjeta.
  /\bp\.?\s?p\.?\s*\(\s*m[ií]n\.?\s*\d+\s*\.?\s*p(?:ers(?:onas)?)?\.?\s*\)/giu,
  /\(\s*m[ií]n(?:imo)?\.?\s*\d+\s*p(?:ers(?:onas)?)?\.?\s*\)/giu,
  // «pxp mín 2p»: lo mismo, escrito de otra manera.
  /\bp\s?x\s?p\b\.?(?:\s*m[ií]n\.?\s*\d+\s*p\b\.?)?/giu,
];

const IMPORTE = '\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?';
const POR_UNIDAD = '(?:\\s*(?:\\/|por|la|al|a la)?\\s*(?:p\\.?\\s?p\\.?|pers(?:ona)?s?\\.?|per\\.?|persona|noche|trayecto|ida y vuelta|i\\/v|p\\b|d[ií]a|diarios?))*';
/** «desde 15€ pp.», «por solo 75€», «¡39€ PP!», «from €244», «desde 1.752 €». */
const PRECIOS = [
  new RegExp(`\\s*¡?\\s*(?:(?:desde|por|a partir de|from)\\s+)?(?:(?:solo|sólo|tan solo)\\s+)?${IMPORTE}\\s*(?:€|euros?)${POR_UNIDAD}\\s*!?`, 'giu'),
  new RegExp(`\\s*(?:desde|por|from)?\\s*€\\s*${IMPORTE}${POR_UNIDAD}`, 'giu'),
];

/** Palabras corrientes que, si vienen en mayúsculas, se escriben en minúscula (sin tildes). */
const COMUNES = new Set(`
  vuelo vuelos directo directos noche noches hotel hoteles hostal desayuno desayunos cena comida todo incluido incluida
  incluye viaje viajes chollo chollos chollazo relax crucero cruceros entrada entradas equipaje facturado gratis salidas salida
  desde hasta ida vuelta solo solos admiten mascotas especial diversion limites playa paquete paquetes cata catas vinos vino
  puente semana finde escapada escapadas cueva cuevas alojamiento centro ciudad oferta ofertas plazas ultimas ultima hora
  minuto todas todos fechas meses dias mes invierno verano otono primavera nuevo nueva nuevos precio precios rebajas descuento
  codigo promocion familias familia ninos parque parques tematico tematicos acceso ilimitado ilimitada pension completa media
  regimen habitacion habitaciones apartamento apartamentos casa casas rural rurales spa balneario circuito termal naturaleza
  pueblos encanto mucho descubrir espera tren trenes ferry barco coche billete billetes trayecto persona personas adultos
  semanas proximas proximos menu menus gourmet gastronomico gastronomica mercadillos navidad chocolate enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre lunes
  martes miercoles jueves viernes sabado domingo fin ano noviembre diciembre estrellas lujo resort aventura esqui nieve forfait
  tambien opciones disponible disponibles plan planes visita visitas guiada guiadas tour tours gratuito gratuita animacion
  toboganes temporada oferton super mega low cost precioso preciosa maravilloso unico unica romantico romantica para con
`.trim().split(/\s+/));

/** Palabras cortas que, en un título en mayúsculas, van en minúscula («¡OCTUBRE EN MALLORCA CON…»). */
const CORTAS = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'sin', 'su', 'sus', 'un', 'una', 'y', 'mas', 'muy', 'tu', 'tus', 'te', 'ya']);
/** Palabras de tres letras que, en mayúsculas, son nombres y no siglas («LLORET DE MAR»). */
const NOMBRES_CORTOS = new Set(['mar', 'sol', 'rio', 'san', 'sur', 'paz', 'luz', 'pas']);
/** Siglas de cuatro letras que se escriben en mayúsculas. */
const SIGLAS = new Set(['alsa', 'iryo', 'avlo', 'aena', 'wifi', 'iata', 'esim', 'ouigo']);

/** Marcas que se escriben con mayúsculas en medio («PortAventura»): no se separan. */
const MARCAS = /^(?:PortAventura|BuscoUnChollo|ViajerosPiratas|BlaBlaCar|GuruWalk|TripAdvisor|CaixaForum|HolidayGuru|FlixBus|WeRoad|AquaXana|LaLiga|McDonald|eDreams|iPhone|YouTube|OUIGO|elBulli)/u;

const mayusculaInicial = (palabra) => palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1).toLocaleLowerCase('es');

const gritada = (palabra) => Boolean(palabra) && /\p{Lu}{2}/u.test(palabra) && palabra === palabra.toLocaleUpperCase('es');

/**
 * Una palabra en mayúsculas («CANTABRIA», «DESAYUNO»), escrita normal. `dentro`: si va detrás de
 * otra palabra gritada (entonces «EN», «LA» son palabras corrientes: «OCTUBRE EN MALLORCA»;
 * si no, empiezan un nombre: «en LA MASSANA» → «La Massana»).
 */
function sinGritar(palabra, { dentro = false, primera = false } = {}) {
  const letras = palabra.replace(/[^\p{L}]/gu, '');
  if (!letras || letras !== letras.toLocaleUpperCase('es') || letras === letras.toLocaleLowerCase('es')) return palabra;
  const clave = normalizarTexto(letras);
  if (COMUNES.has(clave)) return palabra.toLocaleLowerCase('es');
  if (CORTAS.has(clave)) return dentro ? palabra.toLocaleLowerCase('es') : palabra.replace(/\p{L}+/u, mayusculaInicial);
  // «D'ARAN» → «d'Aran» (salvo al principio).
  if (/^[DL]['’]/u.test(palabra)) return `${primera ? palabra[0] : palabra[0].toLowerCase()}'${mayusculaInicial(palabra.slice(2))}`;
  // Las siglas (BCN, SPA, AVE, ALSA) se quedan; lo demás son nombres: «Roma», «Cantabria».
  if ((letras.length < 4 && !NOMBRES_CORTOS.has(clave)) || SIGLAS.has(clave)) return palabra;
  return palabra.replace(/\p{L}+/gu, mayusculaInicial);
}

/** Mayúscula al principio de la frase (también tras «¡» o «¿»). */
const conMayusculaInicial = (texto) => texto.replace(/^([¡¿"«(\s]*)(\p{Ll})/u, (_, antes, letra) => antes + letra.toLocaleUpperCase('es'));

/**
 * El título para las listas, o el mismo si no hay nada que limpiar.
 * @param {string} titulo
 */
export function limpiarTitulo(titulo) {
  if (typeof titulo !== 'string' || !titulo.trim()) return titulo;
  let t = titulo.replace(EMOJIS, ' ');
  for (const patron of COLETILLAS) t = t.replace(patron, ' ');
  // Si el precio cerraba la frase («… desde 15€ pp. Octubre»), el punto se queda.
  const sinPrecio = (precio, posicion, texto) => (/\.\s*$/.test(precio) && /^\s*\p{Lu}/u.test(texto.slice(posicion + precio.length)) ? '. ' : ' ');
  for (const patron of PRECIOS) t = t.replace(patron, sinPrecio);
  // Palabras pegadas por la web: «Madrid¡Duerme», «CalpeEscapada», «compartidaHasta».
  t = t.replace(/([\p{L}\d])([¡¿])/gu, '$1 $2');
  t = t.split(/(\s+)/).map((trozo) => (MARCAS.test(trozo) ? trozo : trozo.replace(/(\p{Ll}{3,})(\p{Lu}\p{Ll}{2,})/gu, '$1 $2'))).join('');
  // Por palabras, también las unidas con «+» o «/» («HOTEL 4*+DESAYUNO+SPA»). La «Y» suelta de un
  // título en mayúsculas («CHOCOLATE Y MERCADILLOS») va en minúscula solo entre palabras gritadas.
  const trozos = t.split(/([\s+/]+)/);
  t = trozos.map((trozo, i) => {
    if (/^[YO]$/.test(trozo)) return gritada(trozos[i - 2]) && gritada(trozos[i + 2]) ? trozo.toLowerCase() : trozo;
    return sinGritar(trozo, { dentro: gritada(trozos[i - 2]), primera: i === 0 });
  }).join('');
  t = t
    .replace(/!{2,}/g, '!')
    .replace(/!(?=\p{L})/gu, '! ')
    .replace(/¡\s*!/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\s*[-–|·]\s*(?=\()/g, ' ')
    .replace(/¿\s*\?/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+([,.;:!?)\]])/g, '$1')
    .replace(/([(¡¿[])\s+/g, '$1')
    .replace(/\s*([|·–-])\s*(?=[|·–-]|$)/g, ' ')
    .replace(/[\s,;:|·–-]+$/u, '')
    .replace(/^[\s,;:|·–-]+/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Mayúscula al empezar cada frase (también tras «¡» o «¿» si empiezan la frase).
  t = t.replace(/([.!?]\s+[¡¿]?\s*)(\p{Ll})/gu, (_, antes, letra) => antes + letra.toLocaleUpperCase('es'));
  return t ? conMayusculaInicial(t) : titulo.trim();
}
