/**
 * Un evento de Planes (o de la portada) abre sus detalles —qué es, cuándo, dónde y su web— con
 * dónde dormir cerca como opción. Antes abría directamente la escapada de al lado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { claveEvento, detalleEvento } from '../site/js/filtros.js';
import { contenidoEvento, filaEvento } from '../site/js/vistas-portada.js';

const concierto = { nombre: 'Concierto de Love of Lesbian', tipo: 'musica', fecha: '2026-10-17', municipio: 'Girona' };
const oferta = (id, precio, km, extra = {}) => ({
  id, tipo: 'hotel', titulo: `Hotel ${id}`, precio, unidad: 'noche', puntuacion: 50, temas: [],
  lugar: { nombre: 'Girona', lat: 41.98, lon: 2.82 }, eventos: [{ ...concierto, km, ...extra }],
});
const ofertas = [
  oferta('lejos-barato', 40, 18),
  oferta('cerca-caro', 120, 0.4, { url: 'https://agenda.example/love-of-lesbian', precio: 'Desde 30 €' }),
  oferta('cerca-barato', 70, 0.4),
  { id: 'otro', tipo: 'hotel', titulo: 'Sin el evento', precio: 10, puntuacion: 90, temas: [], eventos: [{ ...concierto, fecha: '2026-10-18', km: 0 }] },
];

describe('detalles de un evento', () => {
  it('reúne dónde dormir, del más cercano al evento al más lejano y, a igualdad, el más barato', () => {
    const d = detalleEvento(ofertas, claveEvento(concierto));
    assert.deepEqual(d.alojamientos.map((a) => a.oferta.id), ['cerca-barato', 'cerca-caro', 'lejos-barato']);
    // Del evento, la copia con su web y su precio.
    assert.equal(d.evento.url, 'https://agenda.example/love-of-lesbian');
    assert.equal(d.evento.precio, 'Desde 30 €');
  });

  it('sin ninguna oferta que lo tenga (descartadas o de otro día), no hay detalle', () => {
    assert.equal(detalleEvento(ofertas, claveEvento({ ...concierto, fecha: '2026-11-01' })), null);
    const descartadas = new Set(['lejos-barato', 'cerca-caro', 'cerca-barato']);
    assert.equal(detalleEvento(ofertas, claveEvento(concierto), { descartadas }), null);
  });

  it('la fila del evento abre el evento, no el alojamiento', () => {
    const fila = filaEvento({ ...concierto, oferta: ofertas[0] });
    assert.match(fila, /data-evento="concierto de love of lesbian\|2026-10-17"/);
    assert.doesNotMatch(fila, /data-ficha=/);
  });

  it('el detalle enseña el evento primero y los alojamientos como opción', () => {
    const html = contenidoEvento(detalleEvento(ofertas, claveEvento(concierto)));
    assert.match(html, /<h2 id="ficha-titulo">Concierto de Love of Lesbian<\/h2>/);
    assert.match(html, /href="https:\/\/agenda\.example\/love-of-lesbian"[^>]*>.*Más información en su web/);
    assert.match(html, /Desde 30 €/);
    assert.match(html, /¿Quieres dormir cerca\? <span class="suave">\(opcional\)<\/span>/);
    assert.ok(html.indexOf('ficha-titulo') < html.indexOf('data-ficha="cerca-barato"'), 'primero el evento');
    assert.match(html, /data-ficha="cerca-barato"[^]*al lado del evento/);
    assert.match(html, /data-ficha="lejos-barato"[^]*a 18 km del evento/);
  });

  it('sin web en su agenda, se ofrece buscarlo; y una promo sin alojamiento no es «dónde dormir»', () => {
    const promo = { id: 'promo-tren', tipo: 'escapada', titulo: 'Museo con descuento', temas: [], puntuacion: 99, eventos: [{ ...concierto, km: 0 }] };
    const d = detalleEvento([oferta('solo', 50, 2), promo], claveEvento(concierto));
    assert.deepEqual(d.alojamientos.map((a) => a.oferta.id), ['solo']);
    assert.match(contenidoEvento(d), /href="https:\/\/www\.google\.com\/search\?q=Concierto%20de%20Love%20of%20Lesbian%20Girona"[^>]*>.*Buscar horarios y entradas/);
  });
});
