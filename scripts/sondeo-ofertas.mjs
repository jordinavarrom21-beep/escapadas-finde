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
  'wikidata-distinciones.json': wd(descubrir),
  'wikidata-muestra.json': wd(muestra),
  'euskadi-200.json': 'https://api.euskadi.eus/culture/events/v1.0/events/upcoming?_elements=200&_page=1',
  'euskadi-tipos.json': 'https://api.euskadi.eus/culture/events/v1.0/eventType',
  'gva.json': 'https://dadesobertes.gva.es/dataset/25cc4d21-e1dd-4d05-b057-dbcc44d4338c/resource/15084e00-c416-4b4d-b229-7a06f4bf07b0/download/lista-de-actividades-culturales-programadas-por-el-ivc.json',
  'barcelona.json': 'https://opendata-ajuntament.barcelona.cat/data/dataset/a25e60cd-3083-4252-9fce-81f733871cb1/resource/da9e71de-0f8e-417d-928a-56380bfd0231/download',
  'andalucia.json': 'https://datos.juntadeandalucia.es/api/v0/schedule/all?format=json',
  'galicia.json': 'https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0045/axenda-cultura-galicia/103/acceso-aos-datos.json',
};

mkdirSync('sondeo', { recursive: true });
const resumen = [];
for (const [nombre, url] of Object.entries(FUENTES)) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'EscapadasFinde/1.0 (sondeo; contacto en GitHub)', Accept: 'application/json, text/html;q=0.9, */*;q=0.5' }, signal: AbortSignal.timeout(40_000) });
    const texto = await r.text();
    writeFileSync(`sondeo/${nombre}`, texto.slice(0, 3_000_000));
    resumen.push(`${r.status} ${nombre} ${texto.length} bytes ${r.headers.get('content-type')}`);
  } catch (error) {
    resumen.push(`ERROR ${nombre}: ${error.message}`);
  }
}
writeFileSync('sondeo/RESUMEN.txt', `${resumen.join('\n')}\n`);
console.log(resumen.join('\n'));
