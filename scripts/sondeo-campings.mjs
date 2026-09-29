/**
 * Sondeo TEMPORAL (se borra al terminar): qué webs de camping dejan leer sus ofertas.
 * Para cada una: robots.txt, portada y los enlaces de ofertas que encuentre, y qué datos
 * estructurados traen (JSON-LD, __NEXT_DATA__, Nuxt, precios). Solo imprime un resumen.
 */
import { USER_AGENT } from '../src/util/http.js';

const WEBS = [
  'https://www.campings.net/es/ofertas-campings',
  'https://europe.huttopia.com/es/',
  'https://www.yellohvillage.es/',
  'https://www.sandaya.es/',
  'https://www.eurocampings.es/',
  'https://www.pitchup.com/es/',
  'https://www.campingsdecatalunya.com/',
  'https://www.vacansoleil.es/',
  'https://www.eurocamp.es/',
  'https://www.glampinghub.com/es/',
  'https://www.campingred.es/',
  'https://www.homecamper.com/es/',
  'https://www.campings.info/',
  'https://www.camping.info/es',
  'https://www.campings-online.es/',
  'https://www.capfun.es/',
  'https://www.siblu.es/',
  'https://www.tohapi.es/',
];
const PISTA = /ofert|promo|descuent|last.?minute|ultim|chollo|deal|bon-plan|reduc/i;

async function pedir(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-ES,es;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const texto = await r.text();
    return { estado: r.status, url: r.url, texto };
  } catch (error) {
    return { estado: 0, url, texto: '', error: error.message };
  }
}

function resumen(texto) {
  return {
    bytes: texto.length,
    jsonld: (texto.match(/application\/ld\+json/g) ?? []).length,
    next: /__NEXT_DATA__/.test(texto),
    nuxt: /__NUXT__|window\.__NUXT/.test(texto),
    precios: (texto.match(/\d+[.,]?\d*\s?€|€\s?\d+/g) ?? []).length,
    desafio: /captcha|cf-chl|challenge-platform|Access Denied|DataDome|px-captcha/i.test(texto),
    titulo: (texto.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim().slice(0, 90),
  };
}

for (const web of WEBS) {
  const origen = new URL(web).origin;
  const robots = await pedir(`${origen}/robots.txt`);
  const reglas = robots.texto.split('\n').filter((l) => /^(user-agent|disallow|allow)/i.test(l.trim())).slice(0, 25).join(' | ');
  const portada = await pedir(web);
  const enlaces = [...new Set([...portada.texto.matchAll(/href="([^"#]+)"/g)].map((m) => { try { return new URL(m[1], portada.url).href; } catch { return null; } })
    .filter((u) => u && u.startsWith(origen) && PISTA.test(u)))].slice(0, 6);
  console.log(`\n=== ${web}\nrobots ${robots.estado}: ${reglas.slice(0, 700)}`);
  console.log(`portada ${portada.estado} ${portada.url} ${JSON.stringify(resumen(portada.texto))}${portada.error ? ` ERROR ${portada.error}` : ''}`);
  console.log(`enlaces de ofertas: ${enlaces.join('  ')}`);
  for (const enlace of enlaces.slice(0, 2)) {
    const pagina = await pedir(enlace);
    console.log(`  → ${pagina.estado} ${pagina.url} ${JSON.stringify(resumen(pagina.texto))}`);
    const ld = [...pagina.texto.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1].replace(/\s+/g, ' ').slice(0, 300));
    if (ld.length) console.log(`    JSON-LD: ${ld.slice(0, 2).join(' ‖ ')}`);
    const muestra = pagina.texto.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const i = muestra.search(/\d+\s?€/);
    if (i >= 0) console.log(`    texto: …${muestra.slice(Math.max(0, i - 200), i + 150)}…`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
