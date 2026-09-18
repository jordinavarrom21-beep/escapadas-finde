import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import fuente, { extraerDestino, interpretarPrecio, parsear, saleDeEspana } from '../src/fuentes/fly4free.js';
import { validarOferta } from '../src/modelo.js';
import { rutaPermitida } from '../src/util/robots.js';

const leer = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');
const FEED = leer('fly4free-feed.xml');

function contextoFalso() {
  const logs = [];
  return { logs, log: (mensaje) => logs.push(mensaje) };
}

function feedCon(items) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fly4free</title>${items}</channel></rss>`;
}

function item({ titulo, descripcion = '', categorias = [], enlace = 'https://www.fly4free.com/flight-deals/europe/prueba/', p = '1' }) {
  return `<item><title>${titulo}</title><link>${enlace}</link><pubDate>Fri, 18 Sep 2026 08:00:00 +0000</pubDate>
    ${categorias.map((c) => `<category><![CDATA[${c}]]></category>`).join('')}
    <guid isPermaLink="false">https://www.fly4free.com/?p=${p}</guid><description><![CDATA[${descripcion}]]></description></item>`;
}

const ofertas = parsear(FEED, contextoFalso());
const porId = (id) => ofertas.find((o) => o.id === `fly4free:${id}`);

describe('parsear (feed real)', () => {
  it('se queda solo con las ofertas que salen de España, todas válidas', () => {
    const ctx = contextoFalso();
    const resultado = parsear(FEED, ctx);
    assert.deepEqual(resultado.map((o) => o.id).sort(), ['fly4free:771654', 'fly4free:771949', 'fly4free:772121', 'fly4free:772202']);
    assert.deepEqual(ctx.logs, []);
    for (const oferta of resultado) {
      assert.deepEqual(validarOferta(oferta), [], oferta.id);
      assert.ok(oferta.descripcion.length <= 300, oferta.id);
    }
  });

  it('interpreta el vuelo de España a Nueva York', () => {
    const nuevaYork = porId('772202');
    assert.equal(nuevaYork.titulo, 'Crazy-low prices 😉 Cheap full-service flights from Spain to New York from €244');
    assert.equal(nuevaYork.url, 'https://www.fly4free.com/flight-deals/europe/flights-from-spain-to-new-york-e244/');
    assert.equal(nuevaYork.tipo, 'vuelo');
    assert.equal(nuevaYork.vuelo, null);
    assert.equal(nuevaYork.transporte, 'avion');
    assert.equal(nuevaYork.precio, 244);
    assert.equal(nuevaYork.precioTexto, 'from €244');
    assert.equal(nuevaYork.unidad, 'i/v');
    assert.deepEqual(nuevaYork.lugar, { nombre: 'New York' });
    assert.equal(nuevaYork.publicada, '2026-09-17T15:03:27.000Z');
    assert.ok(nuevaYork.etiquetas.includes('top-chollo'));
    assert.ok(!nuevaYork.etiquetas.includes('error-tarifa'));
    assert.ok(!nuevaYork.etiquetas.some((e) => / to |^cheap /.test(e)), 'sin categorías SEO');
  });

  it('incluye las ofertas «from many European cities» con salida española en las categorías', () => {
    assert.deepEqual(porId('772121').lugar, { nombre: 'Bali' });
    assert.equal(porId('772121').precio, 604);
    assert.deepEqual(porId('771949').lugar, { nombre: 'Hong Kong' });
  });

  it('descarta los destinos españoles con salida desde otros países', () => {
    for (const id of ['771992', '772062']) assert.equal(porId(id), undefined, id); // Costa Brava y Tenerife
  });
});

describe('parsear (ofertas desde Barcelona)', () => {
  const xml = feedCon([
    item({
      p: '900001',
      titulo: 'ERROR FARE 🔥 Cheap flights from Barcelona to Tokyo, Japan for €389',
      descripcion: 'Probably a mistake: return flights for just €389. Book fast!',
      categorias: ['Europe', 'Barcelona', 'error fare'],
      enlace: 'https://www.fly4free.com/flight-deals/europe/barcelona-tokyo-e389/?utm_source=rss',
    }),
    item({
      p: '900002',
      titulo: 'Cheap escape to Crete, Greece for €399 p.p. 😎 Flights from Barcelona + 7-night B&amp;B stay at 4* hotel',
      descripcion: 'The price includes return flights and 7 nights with breakfast for €399 per person.',
    }),
    item({
      p: '900003',
      titulo: 'Seafront 4* hotel in Sitges for €80/double',
      descripcion: 'A lovely beach town just 40 minutes from Barcelona.',
      categorias: ['Hotel', 'spain'],
    }),
  ].join(''));
  const [tokio, creta, ...resto] = parsear(xml, contextoFalso());

  it('marca la tarifa errónea y limpia la URL', () => {
    assert.equal(tokio.id, 'fly4free:900001');
    assert.equal(tokio.url, 'https://www.fly4free.com/flight-deals/europe/barcelona-tokyo-e389/');
    assert.equal(tokio.tipo, 'vuelo');
    assert.equal(tokio.precio, 389);
    assert.equal(tokio.precioTexto, 'for €389');
    assert.equal(tokio.unidad, 'i/v');
    assert.deepEqual(tokio.lugar, { nombre: 'Tokyo' });
    assert.deepEqual(tokio.etiquetas, ['barcelona', 'error fare', 'error-tarifa']);
  });

  it('interpreta el paquete con hotel', () => {
    assert.equal(creta.tipo, 'paquete');
    assert.equal(creta.transporte, 'avion');
    assert.equal(creta.precio, 399);
    assert.equal(creta.precioTexto, 'for €399 p.p.');
    assert.equal(creta.unidad, 'pp');
    assert.equal(creta.noches, 7);
    assert.equal(creta.regimen, 'desayuno');
    assert.deepEqual(creta.lugar, { nombre: 'Crete' });
  });

  it('no confunde una distancia desde Barcelona con la salida', () => {
    assert.deepEqual(resto, []);
  });

  it('lanza un error claro si la respuesta no es un feed RSS', () => {
    const desafio = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>';
    assert.throws(() => parsear(desafio, contextoFalso()), /no es un feed RSS/);
  });
});

describe('saleDeEspana', () => {
  const casos = [
    ['Cheap full-service flights from Spain to New York from €244', true],
    ['Error fare: Barcelona to Bangkok for €420 return', true],
    ['cheap flights from madrid', true],
    ['Flights from Paris, Madrid and Rome to Tokyo', true],
    ['Direct flights from Girona to Marrakech', true],
    ['Cheap flights from several Spanish cities to Mexico', true],
    ['Cheap escape to Costa Brava, Spain for €263 p.p. Flights from Budapest + 7-night B&B stay', false],
    ['budapest to barcelona', false],
    ['Cheap flights from Vienna to Madrid', false],
    ['Hotel just 40 minutes from Barcelona', false],
  ];
  for (const [texto, esperado] of casos) {
    it(`${texto} → ${esperado}`, () => assert.equal(saleDeEspana(texto), esperado));
  }
});

describe('extraerDestino e interpretarPrecio', () => {
  it('extrae el destino tras «to» (o «in») sin emojis', () => {
    assert.equal(extraerDestino('Flights from Spain to New York from €244'), 'New York');
    assert.equal(extraerDestino('Flights from Barcelona to the Philippines 🌴 for €525'), 'Philippines');
    assert.equal(extraerDestino('Holiday in Tenerife for €467 p.p.'), 'Tenerife');
    assert.equal(extraerDestino('Cheap flights from Barcelona to many Asian destinations'), null);
  });

  it('no usa i/v en los vuelos solo de ida', () => {
    assert.deepEqual(interpretarPrecio('Cheap one-way flights from Madrid to Zanzibar from €60', 'Only €60, return from €150.'),
      { precio: 60, precioTexto: 'from €60', unidad: null });
    assert.deepEqual(interpretarPrecio('Flights from Madrid to Lima for £300', 'No euro price here.'),
      { precio: null, precioTexto: '', unidad: null });
  });
});

describe('obtener', () => {
  it('declara el feed, que robots.txt permite, y lo descarga con ctx.http', async () => {
    assert.deepEqual(fuente.urls, ['https://www.fly4free.com/feed/']);
    const robots = leer('fly4free-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);

    const pedidas = [];
    const ctx = { ...contextoFalso(), http: { texto: async (url) => { pedidas.push(url); return FEED; } } };
    const resultado = await fuente.obtener(ctx);
    assert.deepEqual(pedidas, fuente.urls);
    assert.equal(resultado.ofertas.length, 4);
    assert.equal(resultado.reemplazar, undefined);
    assert.equal(fuente.id, 'fly4free');
    assert.equal(fuente.modo, 'feed');
  });
});
