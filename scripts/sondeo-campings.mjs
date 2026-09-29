/**
 * Sondeo TEMPORAL (se borra al terminar): guarda el HTML de las páginas de ofertas de
 * webs de camping en sondeo/ para escribir sus lectores con páginas reales.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { USER_AGENT } from '../src/util/http.js';

const INICIOS = [
  ['huttopia', 'https://europe.huttopia.com/es/nuestras-ofertas/', /\/es\/(nuestras-ofertas|promocion)[^"]*\/$/],
  ['huttopia', 'https://europe.huttopia.com/es/promocion-de-invierno/', null],
  ['huttopia', 'https://europe.huttopia.com/es/nuestras-ofertas/alquiler-chalets-en-invierno/', null],
  ['sandaya', 'https://www.sandaya.es/ofertas-especiales', /sandaya\.es\/ofertas-especiales\/[^"?#]+$/],
  ['campingsonline', 'https://www.campings-online.es/ofertas-especiales', /campings-online\.es\/[^"?#]*(ofert|promo|last|descuent)[^"?#]*$/],
  ['campingsnet', 'https://www.campings.net/es/ofertas-campings', null],
];

async function pedir(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-ES,es;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return { estado: r.status, url: r.url, texto: await r.text() };
  } catch (error) {
    return { estado: 0, url, texto: '', error: error.message };
  }
}

const nombre = (url) => new URL(url).pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'portada';
const vistas = new Set();
for (const [web, inicio, patron] of INICIOS) {
  mkdirSync(`sondeo/${web}`, { recursive: true });
  const cola = [inicio];
  let n = 0;
  while (cola.length && n < 8) {
    const url = cola.shift();
    if (vistas.has(url)) continue;
    vistas.add(url); n++;
    const pagina = await pedir(url);
    console.log(`${web} ${pagina.estado} ${pagina.url} ${pagina.texto.length}${pagina.error ? ` ${pagina.error}` : ''}`);
    writeFileSync(`sondeo/${web}/${nombre(url)}.html`, `<!-- ${pagina.estado} ${pagina.url} -->\n${pagina.texto}`);
    if (patron && url === inicio) {
      const enlaces = [...new Set([...pagina.texto.matchAll(/href="([^"#]+)"/g)].map((m) => { try { return new URL(m[1], pagina.url).href; } catch { return null; } }).filter((u) => u && patron.test(u)))];
      console.log(`  enlaces: ${enlaces.join(' ')}`);
      cola.push(...enlaces.slice(0, 7));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
