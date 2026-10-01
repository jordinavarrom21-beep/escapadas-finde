// TEMPORAL: muestras de las fuentes de eventos para programar contra su formato real. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const sparql = `SELECT ?item ?itemLabel ?distincion ?coord ?dia ?inicio ?fin ?municipioLabel WHERE {
  VALUES ?distincion { wd:Q3323691 wd:Q5822758 }
  ?item wdt:P1435 ?distincion .
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P837 ?dia }
  OPTIONAL { ?item wdt:P580 ?inicio }
  OPTIONAL { ?item wdt:P582 ?fin }
  OPTIONAL { ?item wdt:P131 ?municipio }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es" }
} LIMIT 2000`;

const FUENTES = {
  'wikidata-fiestas.json': `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
  'wikidata-fiestas-p31.json': `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql.replace('wdt:P1435 ?distincion', 'wdt:P31 ?distincion'))}`,
  'euskadi-upcoming.json': 'https://api.euskadi.eus/culture/events/v1.0/events/upcoming?_elements=5&_page=1',
  'euskadi-catalogo.html': 'https://opendata.euskadi.eus/catalogo/-/kulturklik-agenda-cultural/',
  'jcyl.json': 'https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records?limit=5',
  'galicia-catalogo.html': 'https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0045/axenda-cultura-galicia',
  'madrid.json': 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json',
  'gva-paquete.json': 'https://dadesobertes.gva.es/api/3/action/package_show?id=cul-agc-ivc',
  'barcelona-paquete.json': 'https://opendata-ajuntament.barcelona.cat/data/api/action/package_show?id=agenda-diaria',
  'andalucia-paquete.json': 'https://www.juntadeandalucia.es/datosabiertos/portal/api/3/action/package_show?id=agenda-de-eventos-organizados-por-la-junta-de-andalucia',
  'datosgob-agendas.json': 'https://datos.gob.es/apidata/catalog/dataset/title/agenda?_pageSize=50&_page=0',
};

mkdirSync('sondeo', { recursive: true });
const resumen = [];
for (const [nombre, url] of Object.entries(FUENTES)) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'EscapadasFinde/1.0 (sondeo; contacto en GitHub)', Accept: 'application/json, text/html;q=0.9, */*;q=0.5' }, signal: AbortSignal.timeout(40_000) });
    const texto = await r.text();
    writeFileSync(`sondeo/${nombre}`, texto.slice(0, 400_000));
    resumen.push(`${r.status} ${nombre} ${texto.length} bytes ${r.headers.get('content-type')}`);
  } catch (error) {
    resumen.push(`ERROR ${nombre}: ${error.message}`);
  }
}
writeFileSync('sondeo/RESUMEN.txt', `${resumen.join('\n')}\n`);
console.log(resumen.join('\n'));
