// TEMPORAL: muestras de las fuentes de eventos para programar contra su formato real. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const descubrir = `SELECT ?d ?dLabel ?prop (COUNT(?i) AS ?n) WHERE {
  { ?i wdt:P1435 ?d . BIND("P1435" AS ?prop) } UNION { ?i wdt:P31 ?d . BIND("P31" AS ?prop) }
  ?d rdfs:label ?l . FILTER(LANG(?l) = "es" && CONTAINS(LCASE(?l), "interés turístico"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es" }
} GROUP BY ?d ?dLabel ?prop ORDER BY DESC(?n)`;
const muestra = `SELECT ?i ?iLabel ?d ?dLabel ?coord ?diaLabel ?inicio ?municipioLabel ?mesLabel WHERE {
  ?i wdt:P1435|wdt:P31 ?d . ?d rdfs:label ?l . FILTER(LANG(?l) = "es" && CONTAINS(LCASE(?l), "interés turístico"))
  OPTIONAL { ?i wdt:P625 ?coord } OPTIONAL { ?i wdt:P837 ?dia } OPTIONAL { ?i wdt:P580 ?inicio }
  OPTIONAL { ?i wdt:P131 ?municipio } OPTIONAL { ?i wdt:P2922 ?mes }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es" }
} LIMIT 3000`;
const wd = (q) => `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`;
const FUENTES = {
  'cataluna-campos.json': 'https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json?$limit=3',
  'jcyl.json': 'https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records?limit=4',
  'madrid-muestra.json': 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json',
};

mkdirSync('sondeo', { recursive: true });
const resumen = [];
for (const [nombre, url] of Object.entries(FUENTES)) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'EscapadasFinde/1.0 (sondeo; contacto en GitHub)', Accept: 'application/json, text/html;q=0.9, */*;q=0.5' }, signal: AbortSignal.timeout(40_000) });
    const texto = await r.text();
    writeFileSync(`sondeo/${nombre}`, nombre.startsWith('madrid') ? texto.slice(0, 40_000) : texto);
    resumen.push(`${r.status} ${nombre} ${texto.length} bytes ${r.headers.get('content-type')}`);
  } catch (error) {
    resumen.push(`ERROR ${nombre}: ${error.message}`);
  }
}
writeFileSync('sondeo/RESUMEN.txt', `${resumen.join('\n')}\n`);
console.log(resumen.join('\n'));
