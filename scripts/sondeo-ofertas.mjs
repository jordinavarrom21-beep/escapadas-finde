// TEMPORAL: sondeo de la API de precios de Vueling (qué llama su web). Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const BASE = 'https://static.vueling.com/corporativeCMS/WebComponents/home/browser/';
const pedir = async (url) => (await fetch(url, { headers: { 'User-Agent': UA } })).text();
mkdirSync('sondeo', { recursive: true });
const vistos = new Set();
const pendientes = ['main.js'];
const hallazgos = new Set();
while (pendientes.length && vistos.size < 150) {
  const archivo = pendientes.shift();
  if (vistos.has(archivo)) continue;
  vistos.add(archivo);
  let js = '';
  try { js = await pedir(BASE + archivo); } catch { continue; }
  for (const m of js.matchAll(/chunk-[A-Z0-9]+\.js/g)) if (!vistos.has(m[0])) pendientes.push(m[0]);
  for (const m of js.matchAll(/`[^`]{0,40}\$\{[^}]{1,60}\}\/[^`]{1,160}`/g)) hallazgos.add(`${archivo}: PLANTILLA ${m[0]}`);
  const i = js.indexOf('apiw.vueling.com/api/v1');
  if (i >= 0) writeFileSync('sondeo/vueling-config.txt', js.slice(Math.max(0, i - 3000), i + 3000));
  for (const m of js.matchAll(/["'`]((?:https?:)?\/\/[^"'`\s]{4,200}|\/?api\/[^"'`\s]{2,200}|[^"'`\s]{0,80}(?:Price|price|Fare|fare|Calendar|calendar|Route|route|Market|market)[^"'`\s]{0,80}\/[^"'`\s]{0,80})["'`]/g)) {
    hallazgos.add(`${archivo}: ${m[1]}`);
  }
}
writeFileSync('sondeo/vueling-urls.txt', [...hallazgos].join('\n'));
writeFileSync('sondeo/resumen.json', JSON.stringify({ archivos: vistos.size, hallazgos: hallazgos.size }, null, 1));
