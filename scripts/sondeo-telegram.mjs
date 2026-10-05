// TEMPORAL: sondeo de canales públicos de Telegram (vista web t.me/s). Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const CANALES = ['guialowcost', 'escapadabarata', 'cazaviajes', 'exprimeviajes_ofertas', 'ofertas_viajes', 'holidayguruES', 'viajerospiratas', 'vuelosbaratosviajerospiratas'];
const cabeceras = { 'User-Agent': 'EscapadasFinde/1.0 (+https://escapadasfinde.com)', 'Accept-Language': 'es-ES,es;q=0.9' };
mkdirSync('sondeo', { recursive: true });
const resumen = [];
async function pedir(nombre, url) {
  try {
    const r = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(30_000), redirect: 'manual' });
    const texto = await r.text();
    writeFileSync(`sondeo/${nombre}`, texto);
    resumen.push(`${r.status} ${nombre} ${texto.length} bytes ${r.headers.get('content-type')} ${r.headers.get('location') ?? ''}`);
  } catch (error) {
    resumen.push(`ERROR ${nombre} ${error.message}`);
  }
}
await pedir('robots-t.me.txt', 'https://t.me/robots.txt');
await pedir('robots-telegram.me.txt', 'https://telegram.me/robots.txt');
for (const canal of CANALES) {
  await pedir(`${canal}.html`, `https://t.me/s/${canal}`);
  await new Promise((ok) => setTimeout(ok, 1500));
}
writeFileSync('sondeo/RESUMEN.txt', `${resumen.join('\n')}\n`);
console.log(resumen.join('\n'));
