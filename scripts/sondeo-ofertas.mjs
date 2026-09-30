/**
 * Sondeo TEMPORAL (se borra al terminar): robots.txt, portada y páginas de ofertas de webs
 * candidatas a fuente. Guarda el HTML en sondeo/ para decidir y escribir sus lectores.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { USER_AGENT } from '../src/util/http.js';

const WEBS = [
  ['muchoviaje', 'https://www.muchoviaje.com/ofertas/fin-de-semana', [
    'https://www.muchoviaje.com/ofertas/fin-de-semana?page=2', 'https://www.muchoviaje.com/ofertas/fin-de-semana?pagina=2',
    'https://www.muchoviaje.com/ofertas/puente-del-pilar', 'https://www.muchoviaje.com/ofertas/ultima-hora', 'https://www.muchoviaje.com/ofertas/parques-tematicos',
  ]],
  ['grandvalira', 'https://www.grandvalira.com/es/ofertas', [
    'https://www.grandvalira.com/es/ofertas-esqui-andorra', 'https://www.grandvalira.com/es/ofertas-hotel-forfait',
    'https://www.grandvalira.com/es/ofertas-esqui-diciembre', 'https://www.grandvalira.com/es/ofertas-navidad-fin-de-ano',
  ]],
  ['chollometro', 'https://www.chollometro.com/', [
    'https://www.chollometro.com/grupo/viajes', 'https://www.chollometro.com/rss/grupo/viajes', 'https://www.chollometro.com/rss/grupos/viajes-y-hoteles',
    'https://www.chollometro.com/grupo/vuelos', 'https://www.chollometro.com/rss/grupo/vuelos', 'https://www.chollometro.com/grupo/hoteles', 'https://www.chollometro.com/rss/grupo/hoteles',
  ]],
];
const PISTA = /ofert|promo|descuent|chollo|escapad|last.?minute|ultima|forfait|paquete/i;

async function pedir(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-ES,es;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return { estado: r.status, url: r.url, texto: await r.text() };
  } catch (error) {
    return { estado: 0, url, texto: '', error: error.message };
  }
}
const nombre = (url) => (`${new URL(url).pathname}${new URL(url).search}`.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'portada').slice(0, 80);
const resumen = (t) => ({
  bytes: t.length, jsonld: (t.match(/application\/ld\+json/g) ?? []).length, next: /__NEXT_DATA__/.test(t), nuxt: /__NUXT__/.test(t),
  precios: (t.match(/\d+[.,]?\d*\s?€|€\s?\d+/g) ?? []).length, desafio: /captcha|cf-chl|challenge-platform|Access Denied|DataDome|px-captcha/i.test(t),
});

for (const [id, portada, extra] of WEBS) {
  mkdirSync(`sondeo/${id}`, { recursive: true });
  const origen = new URL(portada).origin;
  const robots = await pedir(`${origen}/robots.txt`);
  writeFileSync(`sondeo/${id}/robots.txt`, `# ${robots.estado}\n${robots.texto.slice(0, 20000)}`);
  const inicio = await pedir(portada);
  writeFileSync(`sondeo/${id}/portada.html`, `<!-- ${inicio.estado} ${inicio.url} -->\n${inicio.texto}`);
  const enlaces = [...new Set([...inicio.texto.matchAll(/href="([^"#]+)"/g)].map((m) => { try { return new URL(m[1], inicio.url).href; } catch { return null; } })
    .filter((u) => u && u.startsWith(origen) && PISTA.test(new URL(u).pathname)))];
  console.log(`\n=== ${id} robots ${robots.estado} | portada ${inicio.estado} ${inicio.url} ${JSON.stringify(resumen(inicio.texto))}${inicio.error ? ` ERROR ${inicio.error}` : ''}`);
  console.log(`  enlaces: ${enlaces.slice(0, 12).join(' ')}`);
  for (const url of [...new Set([...extra, ...enlaces.slice(0, 4)])].slice(0, 8)) {
    await new Promise((r) => setTimeout(r, 1500));
    const p = await pedir(url);
    console.log(`  → ${p.estado} ${p.url} ${JSON.stringify(resumen(p.texto))}${p.error ? ` ERROR ${p.error}` : ''}`);
    if (p.estado === 200 || /rss|page|pagina/.test(url)) writeFileSync(`sondeo/${id}/${nombre(url)}.html`, `<!-- ${p.estado} ${p.url} -->\n${p.texto}`);
  }
}
