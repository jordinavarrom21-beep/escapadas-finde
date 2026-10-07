import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { fechaConAnio, parsear, precioDe } from '../src/fuentes/holidu.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { AHORA, crearCtx, leerFixture } from './ayudas.js';

const COSTA_BRAVA = leerFixture('holidu-costa-brava.html');
const PIRINEOS = leerFixture('holidu-pirineos.html');
const porId = (ofertas, id) => ofertas.find((o) => o.id === `holidu:${id}`);

describe('holidu: parsear (páginas reales, leídas el 18/09/2026)', () => {
  const { ctx, logs } = crearCtx();
  const costa = parsear(COSTA_BRAVA, ctx);

  it('convierte las 20 tarjetas en alojamientos válidos', () => {
    assert.equal(costa.length, 20);
    assert.deepEqual(logs, []);
    assert.equal(new Set(costa.map((o) => o.id)).size, 20);
    for (const o of [...costa, ...parsear(PIRINEOS, ctx)]) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.equal(o.tipo, 'hotel', 'solo alojamiento');
      assert.equal(o.alojamiento, 'apartamento');
      assert.match(o.url, /^https:\/\/www\.holidu\.es\/d\/\d+$/);
      assert.ok(['noche', 'total'].includes(o.unidad), o.id);
    }
  });

  it('«desde X € por noche» es por alojamiento y noche, sin fechas', () => {
    const o = porId(costa, '48953649');
    assert.equal(o.precio, 106);
    assert.equal(o.unidad, 'noche');
    assert.equal(o.precioTexto, 'desde 106 € por alojamiento y noche');
    assert.equal(o.fechas.salida, null);
    assert.deepEqual([o.lugar.nombre, o.lugar.region], ['Torroella de Montgrí', 'Baix Empordà']);
    assert.deepEqual(o.valoracion, { nota: 10, n: 0 }, 'la tarjeta no dice cuántas opiniones hay');
  });

  it('las ofertas con fechas son el total de la estancia, con noches, descuento y promoción', () => {
    // «128 € · Oferta de primera reserva … descuento del 20%» · «lun, 28/9 - mié, 30/9»
    const o = porId(costa, '69750016');
    assert.equal(o.precio, 128);
    assert.equal(o.unidad, 'total');
    assert.equal(o.precioTexto, '128 € en total, 2 noches');
    assert.deepEqual([o.fechas.salida, o.fechas.vuelta, o.noches], ['2026-09-28', '2026-09-30', 2]);
    assert.equal(o.descuento, 20);
    assert.deepEqual(o.etiquetas, ['Cancelación gratuita', 'Oferta de primera reserva']);
    assert.equal(o.lugar.nombre, 'Llançà', '«Llansá» en la web: se unifica con el nombre oficial');
  });

  it('completa el año que la web no escribe con el día de la semana', () => {
    // «sáb, 24/7 - vie, 30/7»: el 24/7 cae en sábado en 2027, no en 2026.
    const o = porId(costa, '68249073');
    assert.deepEqual([o.fechas.salida, o.fechas.vuelta, o.noches], ['2027-07-24', '2027-07-30', 6]);
    assert.equal(o.precioTexto, '1627 € en total, 6 noches');
  });

  it('las categorías de vistas al mar y a la montaña dan el tema', () => {
    assert.equal(costa.filter((o) => o.temas.includes('playa')).length, 4);
    assert.equal(parsear(PIRINEOS).filter((o) => o.temas.includes('rural')).length, 4);
  });

  it('el «desde 2 € por noche» que publica la web se lee tal cual (lo frena después el guardián de precios)', () => {
    assert.equal(porId(costa, '54911712').precio, 2);
  });
});

describe('holidu: casos límite', () => {
  it('fechaConAnio elige el año en que cuadra el día de la semana', () => {
    assert.equal(fechaConAnio('lun', 28, 9, '2026-09-18'), '2026-09-28');
    assert.equal(fechaConAnio('sáb', 24, 7, '2026-09-18'), '2027-07-24');
    assert.equal(fechaConAnio('vie', 1, 1, '2026-12-20'), '2027-01-01', 'cruza el año: el 1/1/2027 es viernes');
    assert.equal(fechaConAnio('jue', 1, 1, '2026-12-20'), '2026-01-01', 'y el 1/1/2026 era jueves');
  });

  it('precioDe distingue por noche de total y no inventa precios', () => {
    assert.deepEqual(precioDe('desde 95 € por noche'), { precio: 95, precioTexto: 'desde 95 € por alojamiento y noche', unidad: 'noche' });
    assert.deepEqual(precioDe('540 €', 3), { precio: 540, precioTexto: '540 € en total, 3 noches', unidad: 'total' });
    assert.deepEqual(precioDe('Consultar'), { precio: null, precioTexto: '', unidad: null });
  });

  it('devuelve null si la página no trae tarjetas', () => {
    assert.equal(parsear('<html><body>Hola</body></html>'), null);
  });
});

describe('holidu: obtener', () => {
  const paginas = { 0: COSTA_BRAVA, 1: PIRINEOS };
  const respuestas = (cambios = {}) => (url) => {
    const i = fuente.urls.indexOf(url);
    const r = i in cambios ? cambios[i] : paginas[i % 2];
    if (r instanceof Error) throw r;
    return r;
  };

  it('pide los seis destinos con pausas y quita las repetidas entre páginas', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: respuestas() });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.deepEqual(esperas, Array(5).fill(2000));
    assert.equal(ofertas.length, 40, 'las páginas repetidas no duplican ofertas');
    assert.equal(reemplazar, undefined, 'cada destino es una selección: lo que deja de salir caduca solo');
  });

  it('ante un 403 deja de pedir y devuelve lo leído; sin nada leído, lanza', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: respuestas({ 1: new ErrorHttp(403, fuente.urls[1]) }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 2);
    assert.equal(ofertas.length, 20);
    const todas = crearCtx({ respuestas: () => '<html><title>Just a moment...</title></html>' }).ctx;
    await assert.rejects(fuente.obtener(todas), /ninguna página de Holidu.*desafío anti-bot/);
  });

  it('el captcha de AWS WAF (405) también es un bloqueo: no sigue pidiendo las demás páginas', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => { throw new ErrorHttp(405, fuente.urls[0]); } });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de Holidu.*HTTP 405 \(bloqueo anti-bot o captcha\)/);
    assert.equal(peticiones.length, 1, 'una sola petición, no las seis');
  });

  it('usa la fecha de ctx.ahora para las fechas sin año', async () => {
    const { ctx } = crearCtx({ respuestas: respuestas(), ahora: AHORA });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(porId(ofertas, '69750016').fechas.salida, '2026-09-28');
  });
});

describe('holidu: robots.txt', () => {
  it('permite las páginas de destino y prohíbe las redirecciones (/s/ solo se lo prohíbe a Bingbot)', () => {
    const robots = leerFixture('holidu-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
    assert.ok(!rutaPermitida(robots, '/redirect/123'));
  });
});
