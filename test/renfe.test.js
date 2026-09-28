import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { parsear, promociones } from '../src/fuentes/renfe.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const PAGINA = leerFixture('renfe-ofertas.html');
const porId = (ofertas, id) => ofertas.find((o) => o.id === `renfe:promo:${id}`);

/** Página mínima con las tarjetas `rf-card` que se le pasen, bajo una sección. */
const pagina = (tarjetas, seccion = 'Festivales') => `<html><body><h2>${seccion}</h2>${tarjetas
  .map(({ titulo, texto, link = '/es/es/promo', imagen = '/img/x.jpg' }) => `<rf-card text-title="${titulo}" text-subtitle="${texto}" link="${link}" link-image="${imagen}"></rf-card>`)
  .join('')}</body></html>`;

describe('renfe: parsear (página real)', () => {
  const { ctx, logs } = crearCtx();
  const ofertas = parsear(PAGINA, ctx);

  it('convierte las 14 tarjetas de promoción (no los 6 enlaces de experiencias) en ofertas', () => {
    // La página tiene 14 <rf-card> y 6 <rf-card-experience-link>, que son menús, no promociones.
    assert.equal(promociones(PAGINA).length, 14);
    assert.equal(ofertas.length, 14);
    assert.deepEqual(logs, []);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.equal(o.tipo, 'escapada');
      assert.equal(o.transporte, 'tren');
      assert.equal(o.precio, null, 'Renfe no publica precios en esta página');
      assert.equal(o.unidad, null);
      assert.ok(o.descuento > 0 && o.descuento <= 100, o.id);
      assert.ok(!/[?#]/.test(o.url), o.url);
      assert.match(o.imagen, /^https:\/\//);
    }
  });

  it('«hasta un 90 %» no se convierte en un 90 % fijo', () => {
    // La tarjeta dice: «Si tienes entre 18 y 30 años, viaja con hasta un 90% de descuento.»
    const joven = porId(ofertas, 'verano-joven-2026');
    assert.equal(joven.descuento, 90);
    assert.equal(joven.precioTexto, 'hasta un 90 % de descuento');
    assert.equal(porId(ofertas, 'muac-fest').precioTexto, '15 % de descuento');
  });

  it('saca la ciudad del título, el tema de la sección y el código promocional', () => {
    // «Moco Museum. Barcelona» · «30% de descuento con tu billete de Rodalies con el código: RENFEARTE»
    const moco = porId(ofertas, 'moco-museum-barcelona');
    assert.equal(moco.descuento, 30);
    assert.equal(moco.lugar.nombre, 'Barcelona');
    assert.deepEqual(moco.temas, ['ciudad']);
    assert.deepEqual(moco.etiquetas, ['Renfe', 'promoción', 'Museos y exposiciones', 'Código RENFEARTE']);
    assert.deepEqual(porId(ofertas, 'maraton-valencia-trinidad-alfonso-zurich').temas, ['eventos']);
    assert.deepEqual(porId(ofertas, 'terra-natura-y-aqua-natura').temas, ['parques']);
  });
});

describe('renfe: casos límite', () => {
  it('la ciudad de «destino X» no arrastra el resto de la frase', () => {
    const [o] = parsear(pagina([{ titulo: 'Tamborrada', texto: '20% de descuento en tu viaje con destino San Sebastián presentando tu entrada' }]));
    assert.equal(o.lugar.nombre, 'San Sebastián');
    const [compostela] = parsear(pagina([{ titulo: 'Xacobeo', texto: '10% de descuento con destino Santiago de Compostela y vuelta' }]));
    assert.equal(compostela.lugar.nombre, 'Santiago de Compostela');
  });

  it('una promoción en dos secciones queda una vez, con los temas de las dos', () => {
    const html = `<html><body><h2>Recién llegadas</h2><rf-card text-title="Fira de Tardor" text-subtitle="20% de descuento" link="/es/es/fira"></rf-card>
      <h2>Fiestas populares</h2><rf-card text-title="Fira de Tardor" text-subtitle="20% de descuento" link="/es/es/fira"></rf-card></body></html>`;
    const ofertas = parsear(html);
    assert.equal(ofertas.length, 1);
    assert.deepEqual(ofertas[0].temas, ['eventos']);
    assert.deepEqual(ofertas[0].etiquetas, ['Renfe', 'promoción', 'Recién llegadas', 'Fiestas populares']);
  });

  it('un «desde X €» se guarda como precio, sin inventarle unidad', () => {
    const [o] = parsear(pagina([{ titulo: 'Escapada a Lleida', texto: 'Billetes desde 7,95 € a Lleida' }]));
    assert.equal(o.precio, 7.95);
    assert.equal(o.precioTexto, 'desde 7,95 €');
    assert.equal(o.unidad, null);
  });

  it('descarta las tarjetas sin descuento ni precio, sin enlace o con porcentajes imposibles', () => {
    const { ctx, logs } = crearCtx();
    const ofertas = parsear(pagina([
      { titulo: 'Sin nada', texto: 'Ven a conocer la ciudad' },
      { titulo: 'Sin enlace', texto: '20% de descuento', link: '#' },
      { titulo: 'Imposible', texto: '150% de descuento' },
    ]), ctx);
    assert.deepEqual(ofertas, []);
    assert.equal(logs.length, 3);
  });

  it('devuelve null si la página no trae tarjetas (desafío o cambio de la web)', () => {
    assert.equal(parsear('<html><title>Just a moment...</title></html>'), null);
  });
});

describe('renfe: obtener', () => {
  it('una sola petición, sin reintentos, y reemplaza el catálogo entero', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => PAGINA });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.equal(ofertas.length, 14);
    assert.equal(reemplazar, true, 'la página es la lista completa: lo que no sale ha caducado');
  });

  it('distingue el desafío anti-bot de un cambio de la web y de una página sin descuentos', async () => {
    const desafio = crearCtx({ respuestas: () => '<html><div id="cf-chl-widget"></div></html>' }).ctx;
    await assert.rejects(fuente.obtener(desafio), /desafío anti-bot/);
    const cambio = crearCtx({ respuestas: () => '<html><body><p>Nada</p></body></html>' }).ctx;
    await assert.rejects(fuente.obtener(cambio), /no trae ninguna tarjeta/);
    const sinDescuentos = crearCtx({ respuestas: () => pagina([{ titulo: 'Ven', texto: 'Visítanos' }]) }).ctx;
    await assert.rejects(fuente.obtener(sinDescuentos), /Ninguna promoción de Renfe anuncia precio ni descuento/);
  });

  it('un error HTTP se propaga (no deja el catálogo vacío)', async () => {
    const { ctx } = crearCtx({ respuestas: (url) => { throw new ErrorHttp(503, url); } });
    await assert.rejects(fuente.obtener(ctx), (error) => error instanceof ErrorHttp && error.estado === 503);
  });
});

describe('renfe: robots.txt', () => {
  it('permite la página que pide la fuente', () => {
    const robots = leerFixture('renfe-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
  });
});
