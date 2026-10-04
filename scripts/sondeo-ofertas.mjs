// TEMPORAL: muestras para (1) nuevas agendas de eventos y (2) cómo se ve una oferta terminada en
// cada web. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const AGENDAS = {
  'gva.json': 'https://dadesobertes.gva.es/dataset/25cc4d21-e1dd-4d05-b057-dbcc44d4338c/resource/15084e00-c416-4b4d-b229-7a06f4bf07b0/download/lista-de-actividades-culturales-programadas-por-el-ivc.json',
  'gva-paquete.json': 'https://dadesobertes.gva.es/api/3/action/package_show?id=cul-agc-ivc',
  'gva-busqueda.json': 'https://dadesobertes.gva.es/api/3/action/package_search?q=agenda&rows=30',
  'zaragoza-list.json': 'https://www.zaragoza.es/sede/servicio/cultura/evento/list.json?rows=20&srsname=wgs84',
  'zaragoza-upcoming.json': 'https://www.zaragoza.es/sede/servicio/cultura/evento/upcoming.json?rows=20&srsname=wgs84',
  'zaragoza-actividades.json': 'https://www.zaragoza.es/sede/servicio/actividades-evento.json?rows=20&srsname=wgs84',
  'malaga-busqueda.json': 'https://datosabiertos.malaga.eu/api/3/action/package_search?q=agenda&rows=30',
  'andalucia-schedule.json': 'https://datos.juntadeandalucia.es/api/v0/schedule/all?format=json',
  'aragon-busqueda.json': 'https://opendata.aragon.es/ckan/api/3/action/package_search?q=agenda&rows=30',
  'canarias-busqueda.json': 'https://datos.canarias.es/catalogos/general/api/3/action/package_search?q=agenda&rows=30',
  'murcia-busqueda.json': 'https://datosabiertos.regiondemurcia.es/catalogo/api/3/action/package_search?q=agenda&rows=30',
  'navarra-busqueda.json': 'https://datosabiertos.navarra.es/api/3/action/package_search?q=agenda&rows=30',
  'extremadura-busqueda.json': 'https://datosabiertos.juntaex.es/api/3/action/package_search?q=agenda&rows=30',
  'clm-busqueda.json': 'https://datosabiertos.castillalamancha.es/api/3/action/package_search?q=agenda&rows=30',
  'cmadrid-busqueda.json': 'https://datos.comunidad.madrid/catalogo/api/3/action/package_search?q=agenda&rows=30',
  'valencia-ods.json': 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets?where=search(%22agenda%22)&limit=30',
  'baleares-busqueda.json': 'https://catalegdades.caib.cat/api/catalog/v1?q=agenda&limit=30',
  'datosgob-agenda.json': 'https://datos.gob.es/apidata/catalog/dataset/title/agenda?_pageSize=100&_page=0',
  'datosgob-eventos.json': 'https://datos.gob.es/apidata/catalog/dataset/title/eventos?_pageSize=100&_page=0',
  'galicia-turismo.json': 'https://abertos.xunta.gal/api/3/action/package_search?q=axenda&rows=30',
};

const OFERTAS = [{"f":"weekendesk","id":"weekendesk:21305416","url":"https://www.weekendesk.es/fin-de-semana/21305416/escapadas-fin-de-semana-en-L_Ametlla_de_Mar-Cataluna-en_familia","vieja":true},{"f":"weekendesk","id":"weekendesk:21841960","url":"https://www.weekendesk.es/fin-de-semana/21841960/escapadas-fin-de-semana-en-Vandellos-Cataluna-Reserva_verano","vieja":true},{"f":"weekendesk","id":"weekendesk:21873338","url":"https://www.weekendesk.es/fin-de-semana/21873338/escapadas-fin-de-semana-en-CAMBRILS-Cataluna-pension_completa","vieja":true},{"f":"weekendesk","id":"weekendesk:21895918","url":"https://www.weekendesk.es/fin-de-semana/21895918/escapadas-fin-de-semana-en-Lloret_de_Mar-Cataluna-Playa","vieja":true},{"f":"weekendesk","id":"weekendesk:21371796","url":"https://www.weekendesk.es/fin-de-semana/21371796/escapadas-fin-de-semana-en-Platja_d_Aro-Cataluna-minivacaciones_verano","vieja":false},{"f":"weekendesk","id":"weekendesk:21887726","url":"https://www.weekendesk.es/fin-de-semana/21887726/escapadas-fin-de-semana-en-Lloret_de_Mar-Cataluna-Playa","vieja":false},{"f":"escapadarural","id":"escapadarural:512141ed7513c","url":"https://www.escapadarural.com/casa-rural/cuenca/el-mirador-de-carboneras","vieja":true},{"f":"escapadarural","id":"escapadarural:0000000014992","url":"https://www.escapadarural.com/casa-rural/tarragona/cal-marti","vieja":true},{"f":"escapadarural","id":"escapadarural:5f0592337c76b","url":"https://www.escapadarural.com/casa-rural/girona/masia-can-saboia","vieja":true},{"f":"escapadarural","id":"escapadarural:0000000001481","url":"https://www.escapadarural.com/casa-rural/salamanca/rural-montesa","vieja":true},{"f":"escapadarural","id":"escapadarural:0000000015659","url":"https://www.escapadarural.com/casa-rural/tarragona/cal-jafra","vieja":false},{"f":"escapadarural","id":"escapadarural:0000000005428","url":"https://www.escapadarural.com/casa-rural/tarragona/mas-virgili","vieja":false},{"f":"viajerospiratas","id":"viajerospiratas:hoteles/un-apartamento-con-vistas-privilegiadas-en-taormina-italia","url":"https://www.viajerospiratas.es/hoteles/un-apartamento-con-vistas-privilegiadas-en-taormina-italia","vieja":true},{"f":"viajerospiratas","id":"viajerospiratas:hoteles/hoteles-con-spa-incluido-para-una-escapada-relax","url":"https://www.viajerospiratas.es/hoteles/hoteles-con-spa-incluido-para-una-escapada-relax","vieja":true},{"f":"viajerospiratas","id":"viajerospiratas:hoteles/escapada-relax-con-spa-en-asturias","url":"https://www.viajerospiratas.es/hoteles/escapada-relax-con-spa-en-asturias","vieja":true},{"f":"viajerospiratas","id":"viajerospiratas:hoteles/hotel-portaventura","url":"https://www.viajerospiratas.es/hoteles/hotel-portaventura","vieja":true},{"f":"viajerospiratas","id":"viajerospiratas:hoteles/escapada-puente-de-octubre","url":"https://www.viajerospiratas.es/hoteles/escapada-puente-de-octubre","vieja":false},{"f":"viajerospiratas","id":"viajerospiratas:vacaciones/escapada-fin-de-semana-italia-venecia","url":"https://www.viajerospiratas.es/vacaciones/escapada-fin-de-semana-italia-venecia","vieja":false},{"f":"tuscasasrurales","id":"tuscasasrurales:9140","url":"https://www.tuscasasrurales.com/mas-de-la-cadeneta-f9140.htm","vieja":true},{"f":"tuscasasrurales","id":"tuscasasrurales:19256","url":"https://www.tuscasasrurales.com/castell-biosca-f19256.htm","vieja":true},{"f":"tuscasasrurales","id":"tuscasasrurales:8311","url":"https://www.tuscasasrurales.com/el-call-doden-f8311.htm","vieja":true},{"f":"tuscasasrurales","id":"tuscasasrurales:19101","url":"https://www.tuscasasrurales.com/can-querol-masias-de-rocabruna-f19101.htm","vieja":true},{"f":"tuscasasrurales","id":"tuscasasrurales:19501","url":"https://www.tuscasasrurales.com/masia-can-prim-f19501.htm","vieja":false},{"f":"tuscasasrurales","id":"tuscasasrurales:14261","url":"https://www.tuscasasrurales.com/mas-pareta-f14261.htm","vieja":false},{"f":"chollometro","id":"chollometro:2020614","url":"https://www.chollometro.com/ofertas/asturias-cudillero-alojamiento-desayuno-octubre-y-noviembre-desde-19eur-pp-descubre-la-costa-asturiana-2020614","vieja":true},{"f":"chollometro","id":"chollometro:2016750","url":"https://www.chollometro.com/ofertas/costa-brava-platja-daro-comtat-sant-jordi-3-desayuno-por-26eurpersona-octubre-enero-2016750","vieja":true},{"f":"chollometro","id":"chollometro:2015800","url":"https://www.chollometro.com/ofertas/fabuloso-hotel-4-en-escaldes-andorra-muy-centrico-desde-20eur-pp-oct-25eur-nov-2015800","vieja":true},{"f":"chollometro","id":"chollometro:2017558","url":"https://www.chollometro.com/ofertas/madrid-nueva-york-ida-y-vuelta-por-246-eur-2017558","vieja":true},{"f":"chollometro","id":"chollometro:2020412","url":"https://www.chollometro.com/ofertas/hotel-3-desayuno-en-la-massana-andorra-desde-15eur-pp-octubre-2020412","vieja":false},{"f":"chollometro","id":"chollometro:2020276","url":"https://www.chollometro.com/ofertas/una-escapada-de-cuento-medieval-descubre-la-ciudad-de-carcassonne-en-hotel-3desayuno-oct-dic-2020276","vieja":false},{"f":"holidu","id":"holidu:56872574","url":"https://www.holidu.es/d/56872574","vieja":true},{"f":"holidu","id":"holidu:58257140","url":"https://www.holidu.es/d/58257140","vieja":true},{"f":"holidu","id":"holidu:67520324","url":"https://www.holidu.es/d/67520324","vieja":true},{"f":"holidu","id":"holidu:69895781","url":"https://www.holidu.es/d/69895781","vieja":true},{"f":"holidu","id":"holidu:60963371","url":"https://www.holidu.es/d/60963371","vieja":false},{"f":"holidu","id":"holidu:67939311","url":"https://www.holidu.es/d/67939311","vieja":false},{"f":"muchoviaje","id":"muchoviaje:63989","url":"https://www.muchoviaje.com/hotel/santa-monica-playa-en-salou-tarragona-espana?niche=fin-de-semana","vieja":true},{"f":"muchoviaje","id":"muchoviaje:96493","url":"https://www.muchoviaje.com/hotel/balneario-cervantes-en-santa-cruz-de-mudela-ciudad-real-espana?niche=fin-de-semana","vieja":true},{"f":"muchoviaje","id":"muchoviaje:7059","url":"https://www.muchoviaje.com/hotel/portomagno-en-aguadulce-almeria-espana?niche=fin-de-semana","vieja":true},{"f":"muchoviaje","id":"muchoviaje:61600","url":"https://www.muchoviaje.com/hotel/checkin-garbi-calella?niche=fin-de-semana","vieja":true},{"f":"muchoviaje","id":"muchoviaje:38228","url":"https://www.muchoviaje.com/hotel/tropik-estartit?niche=fin-de-semana","vieja":false},{"f":"muchoviaje","id":"muchoviaje:47396","url":"https://www.muchoviaje.com/hotel/zentral-leon-leon?niche=fin-de-semana","vieja":false},{"f":"fly4free","id":"fly4free:773799","url":"https://www.fly4free.com/flight-deals/europe/8-night-costa-transatlantic-cruise-e229/","vieja":true},{"f":"fly4free","id":"fly4free:773490","url":"https://www.fly4free.com/flight-deals/europe/flights-from-europe-to-south-africa-e463/","vieja":true},{"f":"fly4free","id":"fly4free:773704","url":"https://www.fly4free.com/flight-deals/europe/turkish-airlines-flights-from-europe-to-kenya-e427/","vieja":true},{"f":"fly4free","id":"fly4free:773308","url":"https://www.fly4free.com/flight-deals/europe/qatar-airways-flights-from-london-madrid-to-seychelles-e563/","vieja":true},{"f":"fly4free","id":"fly4free:774255","url":"https://www.fly4free.com/flight-deals/europe/4-night-costa-toscana-cruise/","vieja":false},{"f":"fly4free","id":"fly4free:774187","url":"https://www.fly4free.com/flight-deals/europe/flights-from-spain-to-new-york-e244-2/","vieja":false}];
const MARCAS = /expirad|caducad|agotad|finalizad|terminad|no disponible|ya no est[áa]|sold out|404|no existe|no encontrad|cerrad/gi;
const cabeceras = { 'User-Agent': 'EscapadasFinde/1.0 (+https://escapadasfinde.com; sondeo de vigencia)', Accept: 'application/json, text/html;q=0.9, */*;q=0.5', 'Accept-Language': 'es-ES,es;q=0.9' };

mkdirSync('sondeo/ofertas', { recursive: true });
const resumen = [];
for (const [nombre, url] of Object.entries(AGENDAS)) {
  try {
    const r = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(45_000) });
    const texto = await r.text();
    writeFileSync(`sondeo/${nombre}`, texto.slice(0, 3_000_000));
    resumen.push(`${r.status} ${nombre} ${texto.length} bytes ${r.headers.get('content-type')}`);
  } catch (error) {
    resumen.push(`ERROR ${nombre}: ${error.message}`);
  }
}
const vigencia = [];
for (const o of OFERTAS) {
  await new Promise((ok) => setTimeout(ok, 1500));
  try {
    const r = await fetch(o.url, { headers: cabeceras, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    const html = await r.text();
    const titulo = html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim().slice(0, 160) ?? '';
    const marcas = [...new Set((html.replace(/<script[^]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').match(MARCAS) ?? []).map((m) => m.toLowerCase()))];
    const archivo = `${o.f}-${o.vieja ? 'vieja' : 'viva'}-${vigencia.filter((v) => v.f === o.f && v.vieja === o.vieja).length}.html`;
    writeFileSync(`sondeo/ofertas/${archivo}`, html.slice(0, 600_000));
    vigencia.push({ ...o, estado: r.status, final: r.url, redirigida: r.redirected, bytes: html.length, titulo, marcas, archivo });
  } catch (error) {
    vigencia.push({ ...o, error: error.message });
  }
}
writeFileSync('sondeo/vigencia.json', JSON.stringify(vigencia, null, 1));
writeFileSync('sondeo/RESUMEN.txt', `${resumen.join('\n')}\n`);
console.log(resumen.join('\n'));
for (const v of vigencia) console.log(v.vieja ? 'VIEJA' : 'viva ', v.f, v.estado ?? v.error, v.redirigida ? '→ ' + v.final : '', v.marcas?.join(','), '|', v.titulo?.slice(0, 70));
