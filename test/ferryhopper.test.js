import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { parsear, travesias } from '../src/fuentes/ferryhopper.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const IBIZA = leerFixture('ferryhopper-ibiza.html');
const MENORCA = leerFixture('ferryhopper-menorca.html');
const CIVITAVECCHIA = leerFixture('ferryhopper-civitavecchia.html');
const RUTAS = 'https://www.ferryhopper.com/es/ferry-routes/direct';

/** Las seis páginas por turnos con las tres rutas reales que hay de fixture. */
const PAGINAS = { 0: IBIZA, 1: MENORCA, 2: CIVITAVECCHIA, 3: IBIZA, 4: MENORCA, 5: CIVITAVECCHIA };
function respuestas(cambios = {}) {
  return (url) => {
    const respuesta = cambios[url] ?? PAGINAS[fuente.urls.indexOf(url)];
    if (respuesta instanceof Error) throw respuesta;
    if (!respuesta) throw new Error(`url inesperada: ${url}`);
    return respuesta;
  };
}

const porId = (ofertas, id) => ofertas.find((o) => o.id === `ferryhopper:${id}`);

describe('ferryhopper: parsear (páginas reales)', () => {
  it('convierte cada compañía de la ruta en una oferta de ferry válida', () => {
    const { ctx, logs } = crearCtx();
    const ofertas = parsear(IBIZA, ctx);
    assert.deepEqual(ofertas.map((o) => o.id), [
      'ferryhopper:brc-ibz:balearia', 'ferryhopper:brc-ibz:grandi-navi-veloci', 'ferryhopper:brc-ibz:trasmed',
    ]);
    assert.deepEqual(logs, []);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.equal(o.tipo, 'escapada');
      assert.equal(o.transporte, 'ferry');
      assert.equal(o.unidad, null, 'no hay unidad para «por persona y trayecto»: va en precioTexto');
      assert.match(o.precioTexto, /^desde [\d,.]+ € por persona y trayecto \(solo ida\)$/);
      assert.equal(o.url, `${RUTAS}/ferry-barcelona-ibiza`);
      assert.ok(o.descripcion.length <= 300);
      assert.deepEqual(o.lugar, {
        nombre: 'Ibiza', region: 'Islas Baleares', pais: 'España', codigoPais: 'ES', lat: 38.9067, lon: 1.4206, iata: null,
      });
    }
  });

  it('rellena precio, duración, frecuencia e imagen de una travesía', () => {
    const gnv = porId(parsear(IBIZA), 'brc-ibz:grandi-navi-veloci');
    assert.equal(gnv.precio, 13.9);
    assert.equal(gnv.titulo, 'Ferry Barcelona – Ibiza con Grandi Navi Veloci desde 13,9 €');
    assert.match(gnv.descripcion, /Travesía directa de Barcelona a Ibiza con Grandi Navi Veloci: 8h 30m, 5 días a la semana\./);
    assert.match(gnv.descripcion, /precio orientativo de septiembre de 2026/);
    assert.equal(gnv.imagen, 'https://images.ferryhopper.com/ferryconnections/ibiza-eivissa-town-boats.jpg');
    assert.deepEqual(gnv.etiquetas, ['Grandi Navi Veloci', 'Travesía directa', '5 días a la semana', 'Duración 8h 30m']);
  });

  it('una misma página puede traer dos puertos del destino', () => {
    const ofertas = parsear(MENORCA);
    assert.deepEqual(ofertas.map((o) => o.lugar.nombre), ['Mahón', 'Mahón', 'Ciutadella de Menorca']);
    const ciutadella = porId(ofertas, 'brc-ciu:balearia');
    assert.equal(ciutadella.precio, 42.5);
    assert.equal(ciutadella.lugar.lat, 40.0028);
  });

  it('se queda con la dirección que sale de Barcelona, aunque la página enseñe la contraria', () => {
    const [ida] = travesias(CIVITAVECCHIA);
    assert.equal(ida.destino.codigo, 'CIV');
    assert.equal(ida.precio, 61, 'Civitavecchia → Barcelona cuesta 41,64 €; el sentido bueno es el otro');
    const oferta = porId(parsear(CIVITAVECCHIA), 'brc-civ:grimaldi-lines');
    assert.equal(oferta.lugar.pais, 'Italia');
    assert.equal(oferta.lugar.codigoPais, 'IT');
    assert.equal(oferta.titulo, 'Ferry Barcelona – Civitavecchia con Grimaldi Lines desde 61 €');
  });

  it('devuelve null si la página no trae la tabla de compañías', () => {
    assert.equal(parsear('<html><title>Just a moment...</title></html>'), null);
    assert.equal(travesias('<html></html>'), null);
  });

  it('descarta la travesía sin precio y lo registra', () => {
    const sinPrecio = IBIZA.replace(/desde € 13\.90/g, 'Consultar');
    const { ctx, logs } = crearCtx();
    const ofertas = parsear(sinPrecio, ctx);
    assert.equal(ofertas.length, 2);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /Travesía descartada \(Ibiza \/ Grandi Navi Veloci\)/);
  });
});

describe('ferryhopper: obtener', () => {
  it('pide las seis rutas en orden con pausas de 2 s', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: respuestas() });
    const { ofertas } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.deepEqual(esperas, [2000, 2000, 2000, 2000, 2000]);
    assert.equal(ofertas.length, 14);
  });

  it('si una ruta falla, devuelve las de las demás', async () => {
    const rota = `${RUTAS}/ferry-barcelona-mallorca`;
    const { ctx, peticiones, logs } = crearCtx({ respuestas: respuestas({ [rota]: new ErrorHttp(500, rota) }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 6);
    assert.equal(ofertas.length, 11);
    assert.ok(logs.some((l) => l.includes('HTTP 500')));
  });

  it('reemplazar solo deja caducar las ofertas de las rutas leídas', async () => {
    const soloIbiza = (url) => {
      if (url !== fuente.urls[0]) throw new ErrorHttp(500, url);
      return IBIZA;
    };
    const { ctx } = crearCtx({ respuestas: soloIbiza });
    const { reemplazar } = await fuente.obtener(ctx);
    assert.ok(reemplazar({ url: `${RUTAS}/ferry-barcelona-ibiza` }));
    assert.ok(!reemplazar({ url: `${RUTAS}/ferry-barcelona-menorca` }));
  });

  it('ante un 403 deja de pedir y devuelve lo leído', async () => {
    const bloqueada = `${RUTAS}/ferry-barcelona-mallorca`;
    const { ctx, peticiones, logs } = crearCtx({ respuestas: respuestas({ [bloqueada]: new ErrorHttp(403, bloqueada) }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 2);
    assert.equal(ofertas.length, 3);
    assert.ok(logs.some((l) => l.includes('bloqueado')));
  });

  it('lanza un error claro si solo recibe un desafío anti-bot', async () => {
    const { ctx } = crearCtx({ respuestas: () => '<html><title>Just a moment...</title><div id="cf-chl-widget"></div></html>' });
    await assert.rejects(fuente.obtener(ctx), /ninguna ruta de Ferryhopper.*desafío anti-bot/);
  });
});

describe('ferryhopper: robots.txt', () => {
  const robots = leerFixture('ferryhopper-robots.txt');

  it('permite todas las URLs que declara la fuente', () => {
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.ok(rutaPermitida(robots, `${pathname}${search}`), url);
    }
  });

  it('respeta lo que su robots.txt prohíbe', () => {
    assert.ok(!rutaPermitida(robots, '/es/reservations/123'));
    assert.ok(!rutaPermitida(robots, '/es/destinations/byport/barcelona'));
  });
});
