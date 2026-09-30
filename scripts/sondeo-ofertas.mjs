// TEMPORAL: sondeo de la API de Wikipedia para fotos de destino. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';
const UA = 'EscapadasFinde/1.0 (https://github.com/jordinavarrom21-beep/escapadas-finde)';
mkdirSync('sondeo', { recursive: true });
const resumen = {};
const pedir = async (nombre, url) => {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    const t = await r.text();
    resumen[nombre] = { estado: r.status, tipo: r.headers.get('content-type'), bytes: t.length };
    writeFileSync(`sondeo/${nombre}.txt`, t.slice(0, 60000));
  } catch (e) { resumen[nombre] = { error: e.message }; }
};
await pedir('robots-gateway', 'https://api.wikimedia.org/robots.txt');
for (const lugar of ['Tarragona', 'Arinsal', 'Besalú', 'Turín']) {
  await pedir(`buscar-${lugar}`, `https://api.wikimedia.org/core/v1/wikipedia/es/search/page?q=${encodeURIComponent(lugar)}&limit=1`);
}
await pedir('robots-commons-upload', 'https://upload.wikimedia.org/robots.txt');
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
