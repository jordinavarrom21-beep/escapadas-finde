// TEMPORAL: ¿qué parámetros de fecha entiende la ficha de cada web? Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const URLS = {
  weekendesk: 'https://www.weekendesk.es/fin-de-semana/21843318/escapadas-fin-de-semana-en-Lloret_de_Mar-Cataluna-hoteles-solo-adultos',
  atrapalo: 'https://www.atrapalo.com/escapadas/escapada-romantica-con-cava-en-hotel-desitges-a-3-minutos-de-sitges_v69292',
  buscounchollo: 'https://www.buscounchollo.com/reserva-chollo/39689/plan-familiar-en-magic-world-con-todo-incluido-1-nino-gratis',
  holidu: 'https://www.holidu.es/d/47720395',
  escapadarural: 'https://www.escapadarural.com/casa-rural/burgos/casa-rural-muralla-de-haza',
  tuscasasrurales: 'https://www.tuscasasrurales.com/la-balconada-f15530.htm',
  rusticae: 'https://rusticae.es/hotel/hotel-de-aldaca-rural',
  muchoviaje: 'https://www.muchoviaje.com/hotel/balneario-cervantes-en-santa-cruz-de-mudela-ciudad-real-espana?niche=fin-de-semana',
  nomolesten: 'https://nomolesten.com/hoteles-con-encanto/monroyo/consolacion',
  clubrural: 'https://www.clubrural.com/s/Provincia-de-Madrid--Espa%C3%B1a?propertyType=AGRITOURISM&includeOfferIds=56956009',
  campings: 'https://www.campings.net/ofertas-camping-pena-montanesa-en-labuerda-ainsa.htm',
  civitatis: 'https://www.civitatis.com/es/barcelona/visita-guiada-sagrada-familia/',
  guruwalk: 'https://www.guruwalk.com/es/walks/564-free-tour-por-el-casco-antiguo-de-barcelona-barrio-gotico-y-el-borne',
  holidayguru: 'https://www.holidayguru.es/deal/pt/fin-de-semana-en-basilea-suiza-8b9f0f69-4a4a-46e4-8961-619b58a05662/',
  sandaya: 'https://www.sandaya.es/ofertas-especiales/su-fin-de-semana-a-partir-de-119-para-4-personas',
};
const E = '2026-11-13', S = '2026-11-15';
const VARIANTES = {
  checkin: { checkin: E, checkout: S, adults: 2 },
  check_in: { check_in: E, check_out: S },
  checkIn: { checkIn: E, checkOut: S },
  arrival: { arrival: E, departure: S },
  arrivalDate: { arrivalDate: E, departureDate: S },
  fecha_entrada: { fecha_entrada: E, fecha_salida: S },
  fechaEntrada: { fechaEntrada: E, fechaSalida: S },
  startDate: { startDate: E, endDate: S },
  date_from: { date_from: E, date_to: S },
  dateFrom: { dateFrom: E, dateTo: S },
  from: { from: E, to: S },
  date: { date: E },
  fecha: { fecha: E },
  entrada_es: { entrada: '13/11/2026', salida: '15/11/2026' },
  checkin_es: { checkin: '13/11/2026', checkout: '15/11/2026' },
};
const MARCAS = [E, '13/11/2026', '13-11-2026', '20261113', '13.11.2026', '13 nov', '13 de noviembre'];
const cuenta = (html) => MARCAS.reduce((n, m) => n + html.split(m).length - 1, 0);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

mkdirSync('sondeo', { recursive: true });
const resumen = {};
for (const [id, base] of Object.entries(URLS)) {
  const r = resumen[id] = { base: null, variantes: {} };
  try {
    const resp = await fetch(base, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' }, redirect: 'follow' });
    const html = await resp.text();
    writeFileSync(`sondeo/${id}.html`, html);
    r.base = { estado: resp.status, final: resp.url, marcas: cuenta(html), bytes: html.length };
  } catch (e) { r.base = { error: e.message }; continue; }
  for (const [nombre, params] of Object.entries(VARIANTES)) {
    await pausa(700);
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    try {
      const resp = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' }, redirect: 'follow' });
      const html = await resp.text();
      const marcas = cuenta(html);
      r.variantes[nombre] = { estado: resp.status, marcas, final: resp.url === u.href ? '=' : resp.url };
      if (marcas > (r.base.marcas ?? 0)) writeFileSync(`sondeo/${id}--${nombre}.html`, html);
    } catch (e) { r.variantes[nombre] = { error: e.message }; }
  }
  console.log(id, JSON.stringify(r.base), Object.entries(r.variantes).filter(([, v]) => v.marcas > (r.base.marcas ?? 0)).map(([k, v]) => `${k}:${v.marcas}`).join(' '));
}
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
