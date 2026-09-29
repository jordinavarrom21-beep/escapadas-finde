import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarCategoria, detectarEstrellas, esSoloAdultos } from '../src/enriquecer/categoria.js';
import { describirGrupo } from '../src/enriquecer/referencia.js';
import { claveSerie, registrarPrecios, seriesPara, sigueNoche } from '../src/historial.js';
import { nochesDe, parsear as parsearHolidayguru } from '../src/fuentes/holidayguru.js';
import { validarOferta } from '../src/modelo.js';
import { cumpleNinos, leerFiltrosEscapadas, precioDeSerie } from '../site/js/filtros.js';
import { adjetivoNota, contenidoFicha, textoAlojamiento } from '../site/js/plantillas.js';
import { leerFixture, oferta } from './ayudas.js';

const estrellas = (campos) => detectarEstrellas(oferta(campos));

describe('categoría: estrellas del texto', () => {
  it('«hotel 4*», «(4*, 8,8/10…)», «SPA****» y «hotel de 3 estrellas»', () => {
    assert.equal(estrellas({ titulo: '¡Respira Andorra! Naturaleza y hotel 4* en plena montaña' }), 4);
    assert.equal(estrellas({ titulo: 'Escapada', descripcion: 'htop Amaika - Adults Only (4*, 8,8/10 en 5 opiniones)' }), 4);
    assert.equal(estrellas({ titulo: 'Gran Claustre Boutique Hotel & SPA****' }), 4);
    assert.equal(estrellas({ titulo: 'Relax', descripcion: 'Un hotel rural de 3 estrellas situado en el valle' }), 3);
    assert.equal(estrellas({ titulo: 'Egipto', descripcion: 'hoteles 4* o 5* con desayunos' }), 4, 'con varias, la más baja');
  });

  it('no confunde valoraciones, negritas, precios ni actividades', () => {
    assert.equal(estrellas({ titulo: 'Free tour', descripcion: 'con más de 18.000 reseñas de 5 estrellas' }), null);
    assert.equal(estrellas({ titulo: 'Casa', descripcion: '**Vive la sierra en Casa La Parrilla** – a solo 2 km del pueblo' }), null);
    assert.equal(estrellas({ titulo: 'Oferta 2x1 a 25€ la noche' }), null);
    assert.equal(estrellas({ tipo: 'actividad', titulo: 'Tour 5* por Barcelona' }), null);
    assert.equal(estrellas({ tipo: 'vuelo', titulo: 'Vuelo y hotel 4*' }), null);
  });

  it('aplicarCategoria: estrellas de la fuente mandan, hotel por defecto y «solo adultos»', () => {
    const o = aplicarCategoria(oferta({ titulo: 'Relax 4* en la Costa Blanca', descripcion: 'Solo adultos' }));
    assert.deepEqual([o.estrellas, o.alojamiento], [4, 'hotel']);
    assert.ok(o.etiquetas.includes('solo-adultos'));
    assert.equal(aplicarCategoria(oferta({ titulo: 'Hotel 4*', estrellas: 5 })).estrellas, 5);
    assert.equal(aplicarCategoria(oferta({ titulo: 'Camping 3*', alojamiento: 'camping' })).alojamiento, 'camping');
    assert.ok(esSoloAdultos(oferta({ titulo: 'htop Amaika - Adults Only' })));
    assert.ok(!aplicarCategoria(oferta({ titulo: 'Hotel', etiquetas: ['solo-adultos'] })).etiquetas.includes('solo-adultos'), 'se recalcula');
    assert.deepEqual(validarOferta({ ...oferta(), estrellas: 6 }), ['estrellas no válidas: 6']);
  });
});

describe('holidayguru: estrellas y noches', () => {
  it('la categoría del hotel viene como dato; «Noche ampliable…» es una noche', () => {
    const ofertas = parsearHolidayguru(leerFixture('holidayguru-deals.html'));
    const conEstrellas = ofertas.filter((o) => o.estrellas);
    assert.ok(conEstrellas.length >= 3);
    assert.ok(conEstrellas.every((o) => [3, 4].includes(o.estrellas)));
    assert.equal(nochesDe('Noche ampliable desde 28€ noche/p.p'), 1);
    assert.equal(nochesDe('2-3 noches en hotel 3* con vuelos incluidos'), 2);
    assert.equal(nochesDe('Precio por trayecto y persona'), null);
  });
});

describe('historial por noche', () => {
  const hoy = new Date('2026-09-29T10:00:00Z');
  const dia = (d) => `2026-09-${d}`;

  it('una estancia con fechas y total se sigue por noche: 1 noche a 63 € no es una bajada frente a 2 a 127 €', () => {
    const casa = oferta({ id: 'holidu:1', fuente: 'holidu', tipo: 'hotel', precio: 63, unidad: 'total', noches: 1, fechas: { salida: '2026-10-04', vuelta: '2026-10-05' }, vistaUltima: hoy.toISOString() });
    assert.ok(sigueNoche(casa));
    assert.equal(claveSerie(casa), 'holidu:1~noche');
    const historial = { 'holidu:1': [[dia(27), 127]], 'holidu:1~noche': [[dia(27), 63.5], [dia(28), 60]] };
    registrarPrecios(historial, [casa], hoy);
    assert.equal(casa.historialPorNoche, true);
    assert.equal(casa.bajada, null, '63 € por noche no baja de 63,5 ni de 60');
    assert.deepEqual(historial['holidu:1~noche'].at(-1), [dia(29), 63]);
    assert.deepEqual(historial['holidu:1'], [[dia(27), 127]], 'la serie de totales no se toca');
    assert.deepEqual(seriesPara(historial, [['holidu:1', claveSerie(casa)]]), { 'holidu:1': historial['holidu:1~noche'] });
    assert.equal(precioDeSerie({ ...casa, noches: 2, precio: 120 }), 60);
  });

  it('lo demás sigue igual: el id como clave y el precio publicado', () => {
    const escapada = oferta({ id: 'x:1', fuente: 'x', precio: 90, unidad: 'pp', vistaUltima: hoy.toISOString() });
    const historial = { 'x:1': [[dia(27), 100]] };
    registrarPrecios(historial, [escapada], hoy);
    assert.deepEqual([escapada.bajada, escapada.historialPorNoche, claveSerie(escapada)], [10, false, 'x:1']);
  });
});

describe('ficha: rica y coherente', () => {
  const ctx = { fuentes: new Map([['weekendesk', 'Weekendesk']]), temas: new Map(), historial: {}, favoritos: new Set(), viajeros: 2 };
  const hotel = oferta({
    fuente: 'weekendesk', tipo: 'escapada', titulo: 'Escapada en media pensión en Calella', precio: 90, unidad: 'total', noches: 1, precioNoche: 45,
    descripcion: 'htop Amaika - Adults Only (4*, 8,8/10) · 1 noche en habitación doble · Media pensión · Alquiler de hamacas',
    estrellas: 4, alojamiento: 'hotel', regimen: 'media-pension', transporte: 'coche', etiquetas: ['solo-adultos'], valoracion: { nota: 8.8, n: 5 }, vistaPrimera: '2026-09-20T10:00:00Z',
    referencia: { mediana: 58, ahorroPct: 22, grupo: 'escapada:romantico:cataluna', descripcion: 'escapadas románticas en Cataluña, por persona y noche', n: 14 },
  });
  const html = contenidoFicha(hotel, ctx);

  it('resumen arriba: alojamiento con estrellas, valoración con su escala, noches, régimen y solo adultos', () => {
    assert.match(html, /<ul class="ficha__resumen">[^]*Hotel 4★[^]*8,8 Muy bien · 5 opiniones[^]*1 noche[^]*Media pensión[^]*Solo adultos/);
    assert.equal(textoAlojamiento({ alojamiento: 'camping', estrellas: 3 }), 'Camping 3★');
    assert.deepEqual([9.5, 8.8, 7.2, 6, 4].map(adjetivoNota), ['Excelente', 'Muy bien', 'Bien', 'Aceptable', 'Flojo']);
  });

  it('datos en tres bloques, sin «Transporte: coche» y con la valoración atribuida a su web', () => {
    assert.deepEqual([...html.matchAll(/class="ficha__bloque"><h3>([^<]+)</g)].map(([, t]) => t), ['La oferta', 'El precio', 'Seguimiento']);
    assert.doesNotMatch(html, /Transporte/);
    assert.match(html, /<dt>Valoración<\/dt><dd>8,8 \/ 10 · Muy bien · 5 opiniones en Weekendesk/);
    assert.match(html, /<dt>Alojamiento<\/dt><dd>Hotel 4★ · solo adultos/);
    assert.match(html, /<dt>Por persona y noche<\/dt><dd>45\s€ \(90\s€ en total, para 1 noche y 2 personas\)/);
    assert.match(html, /<dt>Precio habitual<\/dt><dd>58\s€: lo normal en escapadas románticas en Cataluña, por persona y noche \(mediana de 14 ofertas\)/);
  });

  it('lo que incluye, como lista; sin repetir el título', () => {
    assert.match(html, /<section class="ficha__incluye"><h3>Qué incluye<\/h3><ul><li>htop Amaika/);
    const repetida = contenidoFicha(oferta({ titulo: 'Apartamento con jardín', descripcion: 'Apartamento con jardín · Gavet de la Conca', lugar: { nombre: 'Gavet de la Conca' } }), ctx);
    assert.doesNotMatch(repetida, /ficha__descripcion|ficha__incluye/);
  });

  it('el transporte incluido sí sale, y la categoría mínima filtra', () => {
    const tren = contenidoFicha(oferta({ titulo: 'Escapada en tren', transporte: 'tren' }), ctx);
    assert.match(tren, /<dt>Transporte incluido<\/dt><dd>Tren/);
    assert.equal(leerFiltrosEscapadas({ est: '4' }).estrellas, 4);
    assert.equal(leerFiltrosEscapadas({ est: '9' }).estrellas, null);
    assert.ok(cumpleNinos({}, ''));
  });

  it('los grupos de comparación se dicen en palabras', () => {
    const o = { lugar: { provincia: 'Girona' } };
    assert.equal(describirGrupo('escapada:spa:girona', o), 'escapadas de relax y spa en Girona, por persona y noche');
    assert.equal(describirGrupo('noche:hotel', o), 'alojamientos, por persona y noche');
    assert.equal(describirGrupo('transporte:tren:trayecto', o), 'billetes de tren, por trayecto');
    assert.equal(describirGrupo('tipo:vuelo:sin-unidad', o), 'chollos de vuelos');
  });
});
