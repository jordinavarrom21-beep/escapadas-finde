// TEMPORAL: segunda ronda — agendas nuevas (formato real) y robots.txt de Chollometro. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const desde = '2026-10-04T00:00:00Z';
const hasta = '2026-11-04T00:00:00Z';
const URLS = {
  'zaragoza-rango.json': `https://www.zaragoza.es/sede/servicio/cultura/evento/list.json?rows=200&start=0&srsname=wgs84&q=${encodeURIComponent(`startDate=le=${hasta};endDate=ge=${desde}`)}`,
  'zaragoza-rango-sort.json': `https://www.zaragoza.es/sede/servicio/cultura/evento/list.json?rows=50&start=0&srsname=wgs84&sort=startDate%20asc&q=${encodeURIComponent(`endDate=ge=${desde}`)}`,
  'zaragoza-fl.json': `https://www.zaragoza.es/sede/servicio/cultura/evento/list.json?rows=5&srsname=wgs84&fl=id,title,startDate,endDate,category,price,subEvent,url`,
  'malaga-2026.csv': 'https://datosabiertos.malaga.eu/recursos/cultura/agenda/2026.csv',
  'canarias-proxima.csv': 'https://datos.canarias.es/catalogos/general/dataset/11dc9d88-b456-4ae2-bcf9-07ad624fd025/resource/d179079c-a2ed-40dc-a748-7b64d093c342/download/agendaproxima.csv',
  'tenerife-deportes.json': 'https://datos.tenerife.es/ckan/dataset/6cde1436-8d6f-4cf6-b5a5-c32c8a738478/resource/de1231c0-957a-4ad0-8b7b-19d6b1bfced6/download/agenda-de-eventos-deportivos-en-tenerife.json',
  'gva.json': 'https://dadesobertes.gva.es/dataset/25cc4d21-e1dd-4d05-b057-dbcc44d4338c/resource/15084e00-c416-4b4d-b229-7a06f4bf07b0/download/lista-de-actividades-culturales-programadas-por-el-ivc.json',
  'robots-chollometro.txt': 'https://www.chollometro.com/robots.txt',
  'robots-zaragoza.txt': 'https://www.zaragoza.es/robots.txt',
  'robots-malaga.txt': 'https://datosabiertos.malaga.eu/robots.txt',
  'robots-gva.txt': 'https://dadesobertes.gva.es/robots.txt',
};
const cabeceras = { 'User-Agent': 'EscapadasFinde/1.0 (+https://escapadasfinde.com)', Accept: 'application/json, text/csv;q=0.9, */*;q=0.5' };
mkdirSync('sondeo', { recursive: true });
const resumen = [];
for (const [nombre, url] of Object.entries(URLS)) {
  try {
    const r = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(60_000) });
    const texto = await r.text();
    writeFileSync(`sondeo/${nombre}`, texto.slice(0, 4_000_000));
    resumen.push(`${r.status} ${nombre} ${texto.length} bytes ${r.headers.get('content-type')}`);
  } catch (error) {
    resumen.push(`ERROR ${nombre}: ${error.message}`);
  }
}
writeFileSync('sondeo/RESUMEN.txt', `${resumen.join('\n')}\n`);
console.log(resumen.join('\n'));
