/**
 * Sondeo TEMPORAL (se borra al terminar): robots.txt, portada y páginas de ofertas de webs
 * candidatas a fuente. Guarda el HTML en sondeo/ para decidir y escribir sus lectores.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { USER_AGENT } from '../src/util/http.js';

const WEBS = [
  ['logitravel', 'https://www.logitravel.com/', ['https://www.logitravel.com/ofertas/', 'https://www.logitravel.com/escapadas/']],
  ['destinia', 'https://destinia.com/', ['https://destinia.com/ofertas/', 'https://destinia.com/escapadas/']],
  ['muchoviaje', 'https://www.muchoviaje.com/', ['https://www.muchoviaje.com/ofertas/', 'https://www.muchoviaje.com/escapadas/']],
  ['balearia', 'https://www.balearia.com/es', ['https://www.balearia.com/es/ofertas']],
  ['trasmed', 'https://www.trasmed.com/es', ['https://www.trasmed.com/es/ofertas']],
  ['alsa', 'https://www.alsa.es/', ['https://www.alsa.es/ofertas-y-promociones', 'https://www.alsa.es/ofertas']],
  ['toprural', 'https://www.toprural.com/', ['https://www.toprural.com/ofertas/']],
  ['hotelesconencanto', 'https://www.hotelesconencanto.org/', ['https://www.hotelesconencanto.org/ofertas/']],
  ['grandvalira', 'https://www.grandvalira.com/es', ['https://www.grandvalira.com/es/ofertas', 'https://www.grandvalira.com/es/promociones']],
  ['baqueira', 'https://www.baqueira.es/', ['https://www.baqueira.es/ofertas', 'https://www.baqueira.es/promociones']],
  ['lamolina', 'https://www.lamolina.cat/es/', ['https://www.lamolina.cat/es/ofertas/', 'https://www.lamolina.cat/es/promociones/']],
  ['chollometro', 'https://www.chollometro.com/', ['https://www.chollometro.com/grupos/viajes', 'https://www.chollometro.com/grupos/hoteles', 'https://www.chollometro.com/rss/grupos/viajes', 'https://www.chollometro.com/rss/grupos/hoteles', 'https://www.chollometro.com/rss/grupos/vuelos']],
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
const nombre = (url) => (new URL(url).pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'portada').slice(0, 80);
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
  for (const url of [...new Set([...extra, ...enlaces.slice(0, 4)])].slice(0, 7)) {
    await new Promise((r) => setTimeout(r, 1500));
    const p = await pedir(url);
    console.log(`  → ${p.estado} ${p.url} ${JSON.stringify(resumen(p.texto))}${p.error ? ` ERROR ${p.error}` : ''}`);
    if (p.estado === 200) writeFileSync(`sondeo/${id}/${nombre(url)}.html`, `<!-- ${p.estado} ${p.url} -->\n${p.texto}`);
  }
}
