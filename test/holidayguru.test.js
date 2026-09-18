import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import fuente, { lugarDelTitulo, parsear, tipoPorTexto } from '../src/fuentes/holidayguru.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';

const leer = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');
const ULTIMO = leer('holidayguru-ultimo-minuto.html');
const FINDE = leer('holidayguru-escapadas-finde.html');
const DEALS = leer('holidayguru-deals.html');
const PAGINAS = {
  'https://www.holidayguru.es/deals/': DEALS,
  'https://www.holidayguru.es/ofertas-ultimo-minuto/': ULTIMO,
  'https://www.holidayguru.es/escapadas-fin-de-semana/': FINDE,
};

function contextoFalso(respuestas = PAGINAS) {
  const logs = [];
  const pedidas = [];
  const pausas = [];
  const http = {
    async texto(url) {
      pedidas.push(url);
      const respuesta = respuestas[url];
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
    async esperar(ms) {
      pausas.push(ms);
    },
  };
  return { logs, pedidas, pausas, http, log: (mensaje) => logs.push(mensaje) };
}

const ultimo = parsear(ULTIMO, contextoFalso());
const deals = parsear(DEALS, contextoFalso());
const porTitulo = (ofertas, inicio) => ofertas.find((o) => o.titulo.startsWith(inicio));

describe('parsear (páginas reales)', () => {
  for (const [nombre, html, minimo] of [['último minuto', ULTIMO, 20], ['escapadas finde', FINDE, 15], ['deals', DEALS, 6]]) {
    it(`extrae ofertas válidas y completas de ${nombre}`, () => {
      const ctx = contextoFalso();
      const ofertas = parsear(html, ctx);
      assert.ok(ofertas.length >= minimo, `${ofertas.length} ofertas`);
      assert.deepEqual(ctx.logs, []);
      assert.equal(new Set(ofertas.map((o) => o.url)).size, ofertas.length);
      for (const o of ofertas) {
        assert.deepEqual(validarOferta(o), [], o.id);
        assert.match(o.id, /^holidayguru:[\da-f-]{36}$/);
        assert.match(o.url, /^https:\/\/(www|viajes)\.holidayguru\.es\/[^?]+$/);
        assert.ok(o.imagen === null || /^https:\/\//.test(o.imagen), o.imagen);
        assert.ok(o.precio > 5 && o.precio < 1500, `${o.titulo}: ${o.precio}`);
        assert.ok(o.precioTexto.includes('€'), o.precioTexto);
      }
    });
  }

  it('ignora las tarjetas promocionales sin precio', () => {
    assert.ok(ULTIMO.includes('Alojamientos BARATOS para este finde'));
    assert.equal(porTitulo(ultimo, 'Alojamientos BARATOS'), undefined);
  });

  it('interpreta las tarjetas de último minuto', () => {
    const lloret = porTitulo(ultimo, 'Lloret de Mar');
    assert.equal(lloret.tipo, 'escapada');
    assert.equal(lloret.precio, 20);
    assert.equal(lloret.unidad, 'pp/noche');
    assert.equal(lloret.lugar.nombre, 'Lloret de Mar');
    assert.match(lloret.publicada, /^2026-\d{2}-\d{2}$/);

    const crucero = porTitulo(ultimo, 'Crucero por el Mediterráneo');
    assert.equal(crucero.tipo, 'paquete');
    assert.equal(crucero.precio, 199);
    assert.equal(crucero.unidad, 'pp');
    assert.equal(crucero.lugar.nombre, 'Costa Toscana');

    const cuenca = porTitulo(ultimo, 'Hotel rural 5* en Cuenca');
    assert.equal(cuenca.tipo, 'hotel');
    assert.ok(cuenca.etiquetas.includes('Alojamiento'));
  });

  it('los vuelos no llevan detalle de vuelo y usan el precio de ida y vuelta si lo dan', () => {
    const cerdena = porTitulo(ultimo, 'Vuelos a Cerdeña');
    assert.equal(cerdena.tipo, 'vuelo');
    assert.equal(cerdena.vuelo, null);
    assert.equal(cerdena.transporte, 'avion');
    assert.equal(cerdena.precio, 30);
    assert.equal(cerdena.unidad, 'i/v');
    assert.equal(cerdena.lugar.nombre, 'Cerdeña');

    const algarve = porTitulo(ultimo, 'Vuelos al Algarve');
    assert.equal(algarve.precio, 18);
    assert.equal(algarve.unidad, null);
    assert.match(algarve.precioTexto, /trayecto/);
  });

  it('lee los datos RSC de Next.js de /deals/ (céntimos, caducidad, etiquetas y país)', () => {
    const hammamet = porTitulo(deals, 'Todo Incluido en Hammamet');
    assert.equal(hammamet.id, 'holidayguru:cc74d1ae-c3d2-4781-b098-257ec123058f');
    assert.equal(hammamet.tipo, 'paquete');
    assert.equal(hammamet.precio, 379);
    assert.equal(hammamet.unidad, 'pp');
    assert.equal(hammamet.caduca, '2027-01-30T23:00:00.000Z');
    assert.deepEqual(hammamet.lugar && [hammamet.lugar.nombre, hammamet.lugar.pais], ['Hammamet', 'Túnez']);
    assert.ok(hammamet.etiquetas.includes('top-chollo'));
    assert.match(hammamet.imagen, /^https:\/\/thumb\.holidayguru\.de\//);
    assert.equal(porTitulo(deals, 'Ganga 4* Andorra').tipo, 'hotel');
  });
});

describe('tipoPorTexto y lugarDelTitulo', () => {
  it('deduce el tipo de oferta', () => {
    assert.equal(tipoPorTexto('Vuelos a Oporto ¡solo 20€!'), 'vuelo');
    assert.equal(tipoPorTexto('Roma: 3 noches de hotel con vuelos'), 'paquete');
    assert.equal(tipoPorTexto('Crucero por el Mediterráneo'), 'paquete');
    assert.equal(tipoPorTexto('Hotel 4* en Peñíscola'), 'hotel');
    assert.equal(tipoPorTexto('Hotel con SPA y desayuno en Sigüenza'), 'escapada');
  });

  it('saca el destino del título', () => {
    assert.equal(lugarDelTitulo('Benidorm: ¡Villas + entradas a Terra Mítica!'), 'Benidorm');
    assert.equal(lugarDelTitulo('Último minuto en Praga'), 'Praga');
    assert.equal(lugarDelTitulo('Junto al Cabo de Gata ¡primera línea!'), 'Cabo de Gata');
    assert.equal(lugarDelTitulo('Octubre Media Pensión en La Palma'), 'La Palma');
    assert.equal(lugarDelTitulo('Chollazo de última hora'), null);
  });
});

describe('obtener', () => {
  it('lee como máximo 3 páginas con pausas de 2 s y quita las repetidas por URL', async () => {
    const ctx = contextoFalso();
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(ctx.pedidas, fuente.urls);
    assert.ok(fuente.urls.length <= 3);
    assert.deepEqual(ctx.pausas, [2000, 2000]);
    assert.equal(reemplazar, true);

    const finde = parsear(FINDE, contextoFalso());
    const urlsDistintas = new Set([...deals, ...ultimo, ...finde].map((o) => o.url));
    assert.ok(urlsDistintas.size < deals.length + ultimo.length + finde.length);
    assert.equal(ofertas.length, urlsDistintas.size);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    assert.ok(porTitulo(ofertas, 'Noviembre en Ámsterdam').caduca, 'se queda la versión de /deals/');
  });

  it('si la web bloquea (403) no pide más páginas y no reemplaza el catálogo', async () => {
    const ctx = contextoFalso({ ...PAGINAS, 'https://www.holidayguru.es/ofertas-ultimo-minuto/': new ErrorHttp(403, 'https://www.holidayguru.es/') });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(ctx.pedidas.length, 2);
    assert.equal(reemplazar, false);
    assert.equal(ofertas.length, deals.length);
    assert.ok(ctx.logs.some((l) => l.includes('bloqueado')));
  });

  it('lanza un error claro si solo recibe un desafío anti-bot', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
    const ctx = contextoFalso(Object.fromEntries(fuente.urls.map((url) => [url, desafio])));
    await assert.rejects(fuente.obtener(ctx), /ninguna página de Holidayguru.*desafío anti-bot/);
    assert.equal(ctx.pedidas.length, 1);
  });
});

describe('robots.txt', () => {
  it('permite todas las URLs que declara la fuente', () => {
    const robots = leer('holidayguru-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
  });
});
