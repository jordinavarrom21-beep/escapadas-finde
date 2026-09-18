import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import fuente, { esDeViajes, parsear } from '../src/fuentes/chollometro.js';
import { validarOferta } from '../src/modelo.js';
import { rutaPermitida } from '../src/util/robots.js';

const leer = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');
const SUBIENDO = leer('chollometro-subiendo.xml');
const NUEVOS = leer('chollometro-nuevos.xml');

function contextoFalso() {
  const logs = [];
  return { logs, log: (mensaje) => logs.push(mensaje) };
}

// Hoy los feeds reales no traen viajes: estos items sintéticos siguen su mismo formato.
function item({ numero, titulo, categoria = 'Viajes', comercio = 'Booking', precio }) {
  const merchant = comercio ? `<pepper:merchant name="${comercio}"${precio ? ` price="${precio}"` : ''}/>` : '';
  const imagen = `https://static.chollometro.com/threads/raw/AbCdE/${numero}_1/re/150x150/qt/55/${numero}_1.jpg`;
  return `<item><category><![CDATA[${categoria}]]></category>${merchant}<media:content medium="image" url="${imagen}" width="100" height="100"/>`
    + `<title><![CDATA[${titulo}]]></title><description><![CDATA[${precio ? `<strong>${precio} - ${comercio}</strong><br />` : ''}<img src="${imagen}"/><br /><p>Oferta de prueba &amp; más detalles.</p>]]></description>`
    + `<link>https://www.chollometro.com/ofertas/oferta-de-prueba-${numero}</link><pubDate>Fri, 18 Sep 2026 10:51:06 +0200</pubDate>`
    + `<guid>https://www.chollometro.com/ofertas/oferta-de-prueba-${numero}</guid></item>`;
}

const conItems = (feed, ...items) => feed.replace('</channel>', `${items.join('')}</channel>`);

const VUELO = item({ numero: 3000001, titulo: '182° - Vuelos Barcelona - Oporto por 30€ ida y vuelta', comercio: 'Ryanair', precio: '30€' });
const HOTEL = item({ numero: 3000002, titulo: '95° - Hotel 4* en Andorra con desayuno, 2 noches', precio: '1.053,49€' });
const PAQUETE = item({ numero: 3000003, titulo: '-12° - Vuelo + hotel 3 noches en Roma', comercio: 'Logitravel', precio: '249€' });
const PARQUE = item({ numero: 3000004, titulo: 'Entradas PortAventura + Ferrari Land', categoria: 'Cultura y ocio', comercio: 'PortAventura' });
const MALETA = item({ numero: 3000005, titulo: '310° - Maleta de cabina compatible con Ryanair y Vueling', categoria: 'Moda y accesorios', comercio: 'Amazon', precio: '24,71€' });

describe('parsear', () => {
  it('descarta todo lo que no es de viajes en los feeds reales de hoy', () => {
    for (const feed of [SUBIENDO, NUEVOS]) {
      const ctx = contextoFalso();
      assert.deepEqual(parsear(feed, ctx), []);
      assert.deepEqual(ctx.logs, []);
    }
  });

  it('convierte los items de viajes en ofertas válidas', () => {
    const ofertas = parsear(conItems(SUBIENDO, VUELO, HOTEL, PAQUETE, PARQUE, MALETA), contextoFalso());
    assert.deepEqual(ofertas.map((o) => [o.id, o.tipo]), [
      ['chollometro:3000001', 'vuelo'],
      ['chollometro:3000002', 'hotel'],
      ['chollometro:3000003', 'paquete'],
      ['chollometro:3000004', 'escapada'],
    ]);
    for (const oferta of ofertas) assert.deepEqual(validarOferta(oferta), [], oferta.id);
  });

  it('rellena los campos a partir del item', () => {
    const [vuelo, hotel, paquete, parque] = parsear(conItems(NUEVOS, VUELO, HOTEL, PAQUETE, PARQUE), contextoFalso());
    assert.equal(vuelo.titulo, 'Vuelos Barcelona - Oporto por 30€ ida y vuelta');
    assert.equal(vuelo.url, 'https://www.chollometro.com/ofertas/oferta-de-prueba-3000001');
    assert.equal(vuelo.imagen, 'https://static.chollometro.com/threads/raw/AbCdE/3000001_1/re/300x300/qt/55/3000001_1.jpg');
    assert.equal(vuelo.descripcion, 'Oferta de prueba & más detalles.');
    assert.deepEqual([vuelo.precio, vuelo.precioTexto, vuelo.unidad], [30, '30€', 'i/v']);
    assert.deepEqual([vuelo.transporte, vuelo.vuelo], ['avion', null]);
    assert.deepEqual(vuelo.etiquetas, ['temperatura:182', 'Viajes', 'Ryanair']);
    assert.equal(vuelo.publicada, '2026-09-18T08:51:06.000Z');
    assert.equal(hotel.precio, 1053.49);
    assert.deepEqual(hotel.lugar, { nombre: 'Andorra' });
    assert.deepEqual(paquete.etiquetas, ['temperatura:-12', 'Viajes', 'Logitravel']);
    assert.deepEqual([parque.precio, parque.precioTexto, parque.unidad], [null, '', null]);
    assert.deepEqual(parque.etiquetas, ['Cultura y ocio', 'PortAventura']);
  });

  it('omite y registra los items que no se pueden interpretar', () => {
    const ctx = contextoFalso();
    const sinNumero = HOTEL.replaceAll('oferta-de-prueba-3000002', 'oferta-de-prueba');
    assert.deepEqual(parsear(conItems(NUEVOS, sinNumero, VUELO), ctx).map((o) => o.id), ['chollometro:3000001']);
    assert.equal(ctx.logs.length, 1);
    assert.match(ctx.logs[0], /Hotel 4\* en Andorra.*número de la oferta/);
  });

  it('rechaza lo que no es un RSS', () => {
    assert.throws(() => parsear('<html><body>Un momento…</body></html>', contextoFalso()), /no es un feed RSS/);
  });
});

describe('esDeViajes', () => {
  const es = (title, category = 'Hogar, vivienda y oficina') => esDeViajes({ title, category: [category] });

  it('acepta la categoría de viajes y las palabras clave claras', () => {
    assert.equal(es('150° - Madrid - Londres en septiembre', 'Viajes'), true);
    assert.equal(es('Escapada a un balneario en Galicia', 'Cultura y ocio'), true);
    assert.equal(es('Billetes AVE Barcelona - Madrid desde 18€', 'Servicios y contratos'), true);
    assert.equal(es('Apartamento en Salou para 4 personas'), true);
    assert.equal(es('Crucero por el Mediterráneo 7 noches'), true);
  });

  it('evita los falsos positivos', () => {
    assert.equal(es('Maleta de cabina Samsonite para Ryanair', 'Moda y accesorios'), false);
    assert.equal(es('Mochila de viaje antirrobo', 'Viajes'), false);
    assert.equal(es('Dron DJI Mini 4 Pro con 34 min de vuelo', 'Electrónica'), false);
    assert.equal(es('Crema de noche Nivea'), false);
    assert.equal(es('Llave inglesa Bahco con nave de herramientas'), false);
    assert.equal(es('Autobús turístico teledirigido - Action', 'Juguetes, familia e hijos'), false);
  });

  it('lo decide lo que nombra primero el título', () => {
    assert.equal(es('Vuelos a Tokio con maleta facturada', 'Viajes'), true);
  });
});

describe('obtener', () => {
  function contexto(respuestas) {
    const pedidas = [];
    const esperas = [];
    return {
      ...contextoFalso(),
      pedidas,
      esperas,
      http: {
        texto: async (url) => {
          pedidas.push(url);
          const respuesta = respuestas[url];
          if (respuesta instanceof Error) throw respuesta;
          return respuesta;
        },
        esperar: async (ms) => { esperas.push(ms); },
      },
    };
  }
  const [URL_SUBIENDO, URL_NUEVOS] = fuente.urls;

  it('lee los dos feeds espaciados y deduplica las ofertas', async () => {
    const vueloNuevo = VUELO.replace('182° - ', '');
    const ctx = contexto({ [URL_SUBIENDO]: conItems(SUBIENDO, VUELO), [URL_NUEVOS]: conItems(NUEVOS, vueloNuevo, HOTEL) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(ctx.pedidas, fuente.urls);
    assert.equal(ctx.esperas.length, 1);
    assert.deepEqual(ofertas.map((o) => o.id), ['chollometro:3000001', 'chollometro:3000002']);
    assert.ok(ofertas[0].etiquetas.includes('temperatura:182'));
    assert.equal(reemplazar, undefined);
  });

  it('sigue con un feed si el otro falla y lanza un error si fallan los dos', async () => {
    const ctx = contexto({ [URL_SUBIENDO]: new Error('HTTP 503'), [URL_NUEVOS]: conItems(NUEVOS, HOTEL) });
    assert.equal((await fuente.obtener(ctx)).ofertas.length, 1);
    assert.match(ctx.logs[0], /No se pudo leer .*subiendo: HTTP 503/);
    const caido = contexto({ [URL_SUBIENDO]: new Error('HTTP 503'), [URL_NUEVOS]: '<html>Cloudflare</html>' });
    await assert.rejects(fuente.obtener(caido), /No responde ningún feed de Chollometro/);
  });

  it('declara solo URLs que permite robots.txt', () => {
    const robots = leer('chollometro-robots.txt');
    for (const url of fuente.urls) assert.equal(rutaPermitida(robots, new URL(url).pathname), true, url);
  });
});
