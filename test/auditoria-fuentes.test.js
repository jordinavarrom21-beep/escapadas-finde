/**
 * Auditoría de octubre de 2026: un test por cada fallo de las fuentes que se ha corregido.
 * Todos fallan sin su arreglo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMERCIOS, comercioDe, extraerBloques, nombresPrivados, parsearEmail, resolverEnlace, urlDirecta,
} from '../src/fuentes/buzon.js';
import { parsear as parsearGrandvalira } from '../src/fuentes/grandvalira.js';
import { esEstancia, fechasDe, parsearCanal } from '../src/fuentes/telegram.js';
import { limpiarTitulo } from '../src/enriquecer/titulos.js';
import { leerFixture } from './ayudas.js';

describe('auditoría de octubre: buzón', () => {
  const atrapalo = COMERCIOS.find((c) => c.nombre === 'Atrápalo');
  const tarjeta = (...enlaces) => `<table><tr><td><a href="https://www.atrapalo.com/entradas/bonobos_e4930224/"><img src="https://www.atrapalo.com/x.jpg" alt=""></a>${enlaces.map((t) => `<a href="https://www.atrapalo.com/entradas/bonobos_e4930224/">${t}</a>`).join(' ')}<p>Eixample Teatre · desde 22 €</p></td></tr></table>`;

  test('la nota de las opiniones («9.3 Extraordinario») no es el título: lo es el nombre, aunque sea corto', () => {
    assert.deepEqual(extraerBloques(tarjeta('9.3 Extraordinario', 'Bonobos'), atrapalo).bloques.map((b) => b.titulo), ['Bonobos']);
    assert.deepEqual(extraerBloques(tarjeta('9,7 Fabuloso', 'Poncia en el Goya'), atrapalo).bloques.map((b) => b.titulo), ['Poncia en el Goya']);
    // Un enlace genérico no hace de nombre: sin título, la tarjeta no es una oferta.
    assert.deepEqual(extraerBloques(tarjeta('9.3 Extraordinario', 'Más'), atrapalo).bloques, []);
  });

  test('«Apúntate gratis» y las demás llamadas a la acción no son el título', () => {
    const vueling = COMERCIOS.find((c) => c.nombre === 'Vueling');
    const html = '<table><tr><td><a href="https://www.vueling.com/es/vueling-club">Apúntate gratis</a><p>Vuelos desde solo 21 €</p></td></tr></table>';
    assert.ok(!extraerBloques(html, vueling).bloques.some((b) => /apúntate/i.test(b.titulo)));
  });

  test('«Hola,» suelto y el titular siguiente no son un saludo con nombre (borraba «Costa Brava» de las ofertas)', () => {
    const html = leerFixture('buzon-groupon.html').replace(/<body([^>]*)>/i, '<body$1><p>Hola,</p><h1>Costa Brava y Andorra</h1>');
    const email = { de: 'noreply@groupon.es', para: 'escapadas.finde@gmail.com', asunto: 'Planes para el finde', fecha: new Date('2026-10-13T10:00:00Z'), html, messageId: 'g1' };
    assert.ok(!nombresPrivados(email).includes('Costa'));
    assert.ok(parsearEmail(email).some((o) => o.titulo.startsWith('Costa Brava:')));
    assert.deepEqual(nombresPrivados({ html: '<p>Hola <b>Jordi Navarro</b>, mira</p>' }), ['Jordi', 'Navarro']);
  });

  test('Huttopia: su web está en europe.huttopia.com, y ahí el enlace se queda con su oferta', () => {
    const huttopia = comercioDe('Huttopia <newsletter@huttopia.com>');
    assert.equal(urlDirecta('https://europe.huttopia.com/es/camping/huttopia-font-romeu/?utm_source=nl', huttopia), 'https://europe.huttopia.com/es/camping/huttopia-font-romeu/');
  });

  test('un enlace que no llega a la web del comercio dice dónde se quedó, sin el token del enlace', async () => {
    const booking = comercioDe('x@booking.com');
    const motivos = [];
    const http = { redireccion: async (url) => (url.includes('email.booking.com') ? { estado: 302, destino: 'https://pagina.intermedia.example/x?t=SECRETO' } : { estado: 200, destino: null }) };
    assert.equal(await resolverEnlace('https://email.booking.com/ls/click?upn=SECRETO', booking, http, { alFallar: (m) => motivos.push(m) }), null);
    assert.deepEqual(motivos, ['acaba en pagina.intermedia.example (responde 200)']);
  });
});

describe('auditoría de octubre: Telegram', () => {
  const canal = { id: 'escapadabarata', canal: 'escapadabarata', hosts: ['t.eeny.it', 'ebarata.com'], tipo: 'hotel' };
  const html = leerFixture('telegram-escapadabarata.html');

  test('una estancia sin año es del año en que se publicó el mensaje, se lea el día que se lea', () => {
    assert.deepEqual(fechasDe('3 noches del 05/10 al 08/10 por 150 €', '2026-09-28'), { salida: '2026-10-05', vuelta: '2026-10-08' });
    const leidas = (ahora) => parsearCanal(html, canal, { log: () => {}, ahora: new Date(ahora) }).find((o) => o.id === 'escapadabarata:6561')?.fechas;
    assert.deepEqual(leidas('2026-10-22T12:00:00Z'), leidas('2026-10-05T12:00:00Z'));
    assert.equal(leidas('2026-10-22T12:00:00Z').salida, '2026-10-14');
  });

  test('un periodo de validez no es una estancia: sin fechas y caduca al acabar el periodo', () => {
    assert.equal(esEstancia({ salida: '2026-11-27', vuelta: '2027-01-03' }, 2), false);
    assert.equal(esEstancia({ salida: '2026-12-10', vuelta: '2026-12-13' }, 3), true);
    assert.equal(esEstancia({ salida: '2026-12-10', vuelta: '2026-12-13' }, null), true);
    const mensaje = `<div class="tgme_channel_info"></div><div class="tgme_widget_message" data-post="escapadabarata/9001">
<div class="tgme_widget_message_text">Casa rural en Teruel<br>De 2 a 5 noches del 27/11 al 03/01 desde 39 € por persona<br>Enlace: <a href="https://t.eeny.it/abc">https://t.eeny.it/abc</a></div>
<time datetime="2026-10-10T09:00:00+00:00"></time></div>`;
    const [oferta] = parsearCanal(mensaje, canal, { log: () => {}, ahora: new Date('2026-10-14T10:00:00Z') });
    assert.equal(oferta.fechas.salida, null);
    assert.equal(oferta.caduca, '2027-01-03T22:59:59.000Z');
  });
});

describe('auditoría de octubre: otras fuentes', () => {
  test('Grandvalira: un pack de más de mil euros se lee entero («1195,97 €», no «195,97»)', () => {
    const tarjeta = (precio) => `<html><body><article class="card-detailed"><h3 class="card-detailed__title">Hotel + Forfait</h3>
<p class="card-detailed__text">7 noches de hotel y 6 días de forfait. Precio por persona.</p>
<div class="card-detailed__date"><time datetime="2026-12-05">05/12/2026</time> – <time datetime="2026-12-12">12/12/2026</time></div>
<span class="card-detailed__plain-text">desde ${precio}</span></article></body></html>`;
    const precio = (texto) => parsearGrandvalira(tarjeta(texto), 'https://www.grandvalira.com/es/ofertas-hotel-forfait')[0].precio;
    assert.equal(precio('1195,97 €'), 1195.97);
    assert.equal(precio('2450 €'), 2450);
    assert.equal(precio('1.195,97 €'), 1195.97);
    assert.equal(precio('195,97 €'), 195.97);
  });

  test('títulos: el precio sale entero (también de cuatro cifras) y sin el «for just» o «from just» de delante', () => {
    assert.equal(limpiarTitulo('Semana en Tailandia por 1299 €'), 'Semana en Tailandia');
    assert.equal(limpiarTitulo('Cheap flights to Rome for just 99 €'), 'Cheap flights to Rome');
    assert.equal(limpiarTitulo('Return flights from Barcelona to Tokyo from just €399'), 'Return flights from Barcelona to Tokyo');
    assert.equal(limpiarTitulo('Vuelos a Roma desde 29,99 €'), 'Vuelos a Roma');
  });
});
