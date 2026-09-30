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
await pedir('robots-es', 'https://es.wikipedia.org/robots.txt');
for (const lugar of ['Tarragona', 'Arinsal', 'Besalú', 'Turín', 'Cadaqués', 'Vall_de_Boí']) {
  await pedir(`resumen-${lugar}`, `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lugar)}`);
}
await pedir('accion-varios', 'https://es.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|coordinates&piprop=thumbnail&pithumbsize=800&redirects=1&titles=' + encodeURIComponent('Tarragona|Arinsal|Besalú|Turín'));
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
