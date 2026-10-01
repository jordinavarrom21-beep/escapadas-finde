/**
 * Provincia y comunidad autónoma de cada oferta en España. Cada web rellena
 * `lugar.region` a su manera: la provincia («Girona»), la comunidad («Cataluña»), una
 * comarca («Baix Empordà»), una zona turística («Costa Brava») o «Provincia de Gerona».
 * Con eso, filtrar por «Girona» escondía Lloret de Mar de Weekendesk (región «Cataluña»)
 * y la referencia de precio partía una misma zona en varios grupos.
 *
 * Aquí se deduce `lugar.provincia` y `lugar.comunidad` (null si no se sabe) sin tocar
 * `region`, que sigue siendo lo que dice la web.
 */
import { normalizarTexto } from '../util/xml.js';

/** Comunidad → sus provincias (nombres oficiales, como se enseñan). */
const PROVINCIAS_POR_COMUNIDAD = {
  Andalucía: ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'],
  Aragón: ['Huesca', 'Teruel', 'Zaragoza'],
  Asturias: ['Asturias'],
  'Islas Baleares': ['Islas Baleares'],
  Canarias: ['Las Palmas', 'Santa Cruz de Tenerife'],
  Cantabria: ['Cantabria'],
  'Castilla-La Mancha': ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'],
  'Castilla y León': ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'],
  Cataluña: ['Barcelona', 'Girona', 'Lleida', 'Tarragona'],
  'Comunidad Valenciana': ['Alicante', 'Castellón', 'Valencia'],
  Extremadura: ['Badajoz', 'Cáceres'],
  Galicia: ['A Coruña', 'Lugo', 'Ourense', 'Pontevedra'],
  'Comunidad de Madrid': ['Madrid'],
  'Región de Murcia': ['Murcia'],
  Navarra: ['Navarra'],
  'País Vasco': ['Álava', 'Bizkaia', 'Gipuzkoa'],
  'La Rioja': ['La Rioja'],
  Ceuta: ['Ceuta'],
  Melilla: ['Melilla'],
};

/** Otros nombres de provincias, islas, comarcas y zonas turísticas → provincia. */
const ALIAS_PROVINCIA = {
  gerona: 'Girona', lerida: 'Lleida', 'la coruna': 'A Coruña', coruna: 'A Coruña', orense: 'Ourense',
  vizcaya: 'Bizkaia', guipuzcoa: 'Gipuzkoa', alava: 'Álava', 'castellon de la plana': 'Castellón',
  baleares: 'Islas Baleares', 'illes balears': 'Islas Baleares', mallorca: 'Islas Baleares',
  menorca: 'Islas Baleares', ibiza: 'Islas Baleares', eivissa: 'Islas Baleares', formentera: 'Islas Baleares',
  tenerife: 'Santa Cruz de Tenerife', 'la palma': 'Santa Cruz de Tenerife', 'la gomera': 'Santa Cruz de Tenerife',
  'el hierro': 'Santa Cruz de Tenerife', 'gran canaria': 'Las Palmas', lanzarote: 'Las Palmas', fuerteventura: 'Las Palmas',
  // Comarcas y zonas de Cataluña que solo están en una provincia.
  'costa brava': 'Girona', 'baix emporda': 'Girona', 'alt emporda': 'Girona', garrotxa: 'Girona', girones: 'Girona',
  selva: 'Girona', 'pla de l estany': 'Girona', ripolles: 'Girona',
  'costa dorada': 'Tarragona', 'costa daurada': 'Tarragona', 'baix camp': 'Tarragona', 'alt camp': 'Tarragona',
  tarragones: 'Tarragona', priorat: 'Tarragona', 'baix penedes': 'Tarragona', 'terres de l ebre': 'Tarragona',
  'delta de l ebre': 'Tarragona',
  'costers del segre': 'Lleida', noguera: 'Lleida', 'port del comte': 'Lleida', 'valle de aran': 'Lleida',
  'val d aran': 'Lleida', 'vall d aran': 'Lleida', 'pallars sobira': 'Lleida', 'pallars jussa': 'Lleida',
  'alt urgell': 'Lleida', solsones: 'Lleida', segarra: 'Lleida', urgell: 'Lleida',
  barcelones: 'Barcelona', maresme: 'Barcelona', garraf: 'Barcelona', 'alt penedes': 'Barcelona',
  penedes: 'Barcelona', 'penedes do': 'Barcelona', 'valles oriental': 'Barcelona', 'valles occidental': 'Barcelona',
  bages: 'Barcelona', anoia: 'Barcelona', osona: 'Barcelona', bergueda: 'Barcelona',
};

/** Otros nombres de comunidades y zonas que abarcan varias provincias → comunidad. */
const ALIAS_COMUNIDAD = {
  catalunya: 'Cataluña', 'pirineo catalan': 'Cataluña', 'comarcas centrales': 'Cataluña', cerdanya: 'Cataluña',
  'pais vasco euskadi': 'País Vasco', euskadi: 'País Vasco', 'castilla la mancha': 'Castilla-La Mancha',
  madrid: 'Comunidad de Madrid', murcia: 'Región de Murcia', 'comunitat valenciana': 'Comunidad Valenciana',
  'islas canarias': 'Canarias', 'principado de asturias': 'Asturias',
};

const clave = (texto) => normalizarTexto(texto ?? '')
  .replace(/[-'’·]/g, ' ')
  .replace(/^(?:provincia|comarca|comunidad) de\s+/, '')
  .replace(/^(?:el|la|les|l)\s+/, '')
  .replace(/\s+/g, ' ')
  .trim();

const PROVINCIA = new Map();
const COMUNIDAD_DE = new Map();
const COMUNIDAD = new Map();
for (const [comunidad, provincias] of Object.entries(PROVINCIAS_POR_COMUNIDAD)) {
  COMUNIDAD.set(clave(comunidad), comunidad);
  for (const provincia of provincias) {
    PROVINCIA.set(clave(provincia), provincia);
    COMUNIDAD_DE.set(provincia, comunidad);
  }
}
for (const [alias, provincia] of Object.entries(ALIAS_PROVINCIA)) PROVINCIA.set(clave(alias), provincia);
for (const [alias, comunidad] of Object.entries(ALIAS_COMUNIDAD)) COMUNIDAD.set(clave(alias), comunidad);

const enEspana = (lugar) => !lugar?.pais || normalizarTexto(lugar.pais) === 'espana' || lugar.codigoPais === 'ES';

/**
 * Provincia y comunidad de un lugar de España, deducidas de `region` (o, si no dice
 * nada, del nombre, que a veces es la propia provincia: «Girona»).
 * @returns {{provincia: string|null, comunidad: string|null}}
 */
export function zonaDe(lugar) {
  if (!lugar || !enEspana(lugar)) return { provincia: null, comunidad: null };
  for (const texto of [lugar.region, lugar.nombre]) {
    const k = clave(texto);
    if (!k) continue;
    const provincia = PROVINCIA.get(k);
    if (provincia) return { provincia, comunidad: COMUNIDAD_DE.get(provincia) };
    const comunidad = COMUNIDAD.get(k);
    // «Madrid», «Murcia» o «Navarra» son provincia y comunidad a la vez: gana la provincia.
    if (comunidad) return { provincia: null, comunidad };
  }
  return { provincia: null, comunidad: null };
}

/** Rellena `lugar.provincia` y `lugar.comunidad` (null si no se sabe). */
export function aplicarZona(oferta) {
  if (oferta.lugar) Object.assign(oferta.lugar, zonaDe(oferta.lugar));
  return oferta;
}

/**
 * La provincia de España que se nombra dentro de un texto («Costa de Huelva», «Hotel en la
 * costa de Almería»), o null. Solo nombres de provincia o isla de dos o más letras enteras.
 */
export function provinciaEnTexto(texto) {
  const k = ` ${clave(texto)} `;
  for (const [alias, provincia] of PROVINCIA) {
    if (alias.length >= 4 && k.includes(` ${alias} `)) return provincia;
  }
  return null;
}
