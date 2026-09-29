/**
 * Calidad de lo que enseña cada tarjeta: atributos coherentes con el tipo de oferta
 * (una de bus no habla de gasolina), fechas de viaje separadas de la caducidad,
 * cuándo se comprobó cada dato y etiquetas con un cálculo que se puede explicar.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { crearOferta } from '../src/modelo.js';
import { medirDistancias } from '../site/js/filtros.js';
import { contenidoFicha, tarjeta } from '../site/js/plantillas.js';
import { sinRepetir } from '../src/enriquecer/eventos.js';

const ORIGEN = { nombre: 'Barcelona', lat: 41.3874, lon: 2.1686 };
const TOULOUSE = { nombre: 'Toulouse', pais: 'Francia', lat: 43.6045, lon: 1.444 };

let n = 0;
const oferta = (campos = {}) => crearOferta({
  id: `prueba:${++n}`, fuente: 'prueba', titulo: `Oferta ${n}`, url: 'https://ejemplo.es/oferta', ...campos,
});

function ctxPara(ofertas, extra = {}) {
  return {
    temas: new Map(), fuentes: new Map([['prueba', 'Prueba']]), favoritos: new Set(), historial: {},
    distancias: medirDistancias(ofertas, null, ORIGEN), desde: ORIGEN.nombre, viajeros: 2, ...extra,
  };
}

describe('calidad: el transporte de la oferta manda', () => {
  const comun = { lugar: TOULOUSE, cocheMin: 256, cocheKm: 390, precio: 25.49, unidad: 'pp' };
  const bus = oferta({ ...comun, titulo: 'Bus Barcelona – Toulouse', transporte: 'bus', costeCoche: { eur: 98.3, litros: 51.4 } });
  const coche = oferta({ ...comun, titulo: 'Casa rural en Toulouse', transporte: null, costeCoche: { eur: 98.3, litros: 51.4 } });

  it('una oferta de bus no enseña tiempo ni gasolina de coche en la tarjeta', () => {
    const html = tarjeta(bus, ctxPara([bus]));
    assert.ok(!html.includes('🚗'), 'sin tiempo en coche');
    assert.ok(!html.includes('⛽'), 'sin coste de gasolina');
    assert.match(html, /📍 \d+ km/, 'la distancia sí, en línea recta');
  });

  it('en la ficha, el coche solo aparece como comparación explícita y sin gasolina', () => {
    const html = contenidoFicha(bus, ctxPara([bus]));
    assert.match(html, /Esta oferta va en autobús/);
    assert.match(html, /Para comparar: en coche serían 4 h 16 min/);
    assert.ok(!html.includes('⛽'));
  });

  it('a lo que se va en coche le siguen saliendo el tiempo y la gasolina', () => {
    const html = tarjeta(coche, ctxPara([coche]));
    assert.match(html, /🚗 4 h 16 min/);
    assert.match(html, /⛽ ≈ 98\s€ de gasolina ida y vuelta · estimado/);
  });
});

describe('calidad: el tiempo y los eventos son los de las fechas del viaje', () => {
  const tiempoSabado = { dia: '2026-10-03', maxC: 24, minC: 14, lluviaPct: 10, codigo: 0, texto: 'Despejado' };
  const evento = { nombre: 'Fira de Tardor', fecha: '2026-10-03', url: 'https://ejemplo.cat/fira', municipio: 'Olot' };
  const flexible = oferta({ titulo: 'Casa rural en Olot', tiempo: tiempoSabado, eventos: [evento] });
  const conFinde = oferta({ titulo: 'Bus a Olot', fechas: { salida: '2026-10-02', findeId: '2026-10-02' }, tiempo: tiempoSabado, eventos: [evento] });

  it('una oferta de fechas flexibles no pone en la tarjeta el tiempo ni los eventos de un finde que no es el suyo', () => {
    const html = tarjeta(flexible, ctxPara([flexible]));
    assert.ok(!html.includes('Despejado'));
    assert.ok(!html.includes('Fira de Tardor'));
  });

  it('en su ficha aparecen, pero diciendo que son una suposición', () => {
    const html = contenidoFicha(flexible, ctxPara([flexible]));
    assert.match(html, /Si vas el sáb 3 oct: /);
    assert.match(html, /Qué hay el próximo finde por la zona \(si vas entonces\)/);
  });

  it('con fechas propias se enseñan en la tarjeta tal cual', () => {
    const html = tarjeta(conFinde, ctxPara([conFinde]));
    assert.match(html, /Despejado/);
    assert.match(html, /Fira de Tardor/);
    assert.ok(!html.includes('Si vas el'));
  });

  it('el mismo acto en el mismo municipio cuenta una vez', () => {
    const lista = sinRepetir([
      { nombre: 'GospelPraise', fecha: '2026-10-04', url: null, municipio: 'Torello' },
      { nombre: 'Gospelpraise', fecha: '2026-10-03', url: 'https://teatrecirvianum.cat/', municipio: 'Torello' },
      { nombre: 'GospelPraise', fecha: '2026-10-03', url: null, municipio: 'Vic' },
      { nombre: 'Parcs en concert', fecha: '2026-10-02', url: null, municipio: 'Montesquiu' },
    ]);
    assert.deepEqual(lista.map((e) => [e.nombre, e.fecha, e.municipio, e.url]), [
      ['GospelPraise', '2026-10-03', 'Torello', 'https://teatrecirvianum.cat/'],
      ['GospelPraise', '2026-10-03', 'Vic', null],
      ['Parcs en concert', '2026-10-02', 'Montesquiu', null],
    ]);
  });
});

describe('calidad: la fecha del viaje no se confunde con la caducidad de la promoción', () => {
  it('una oferta flexible dice «Fechas flexibles» y aparte hasta cuándo vale la promoción', () => {
    const o = oferta({ caduca: '2026-09-30T21:00:00.000Z' });
    const pasadaMedianoche = oferta({ caduca: '2026-09-30T22:30:00.000Z' });
    assert.match(tarjeta(pasadaMedianoche, ctxPara([pasadaMedianoche])), /Promoción hasta el jue 1 oct/);
    const html = tarjeta(o, ctxPara([o]));
    assert.match(html, /Fechas flexibles · ⏳ Promoción hasta el mié 30 sep/, 'en hora de Madrid: las 23:00 del 30');
    assert.ok(!/Fechas flexibles · hasta el/.test(html));
    const ficha = contenidoFicha(o, ctxPara([o]));
    assert.match(ficha, /<dt>Fechas de viaje<\/dt><dd>Flexibles: la web no publica fechas concretas/);
    assert.match(ficha, /<dt>Reserva<\/dt><dd>Promoción hasta el mié 30 sep/);
  });

  it('con fechas concretas se enseñan esas y no una caducidad que es la propia salida', () => {
    const o = oferta({ fechas: { salida: '2026-10-02T08:25:00' }, caduca: '2026-10-02T06:25:00.000Z' });
    const html = tarjeta(o, ctxPara([o]));
    assert.match(html, /vie 2 oct/);
    assert.ok(!html.includes('Promoción hasta'));
  });

  it('una caducidad supuesta por el vigilante (newsletters) no se presenta como dato de la web', () => {
    const o = oferta({ caduca: '2026-10-05T10:00:00.000Z', etiquetas: ['newsletter', 'caduca-estimada'] });
    assert.ok(!tarjeta(o, ctxPara([o])).includes('Promoción hasta'));
  });
});

describe('calidad: cada oferta dice cuándo se comprobó', () => {
  const ahora = new Date('2026-09-29T10:00:00Z');
  const ctx = (ofertas) => ctxPara(ofertas, { ahora, intervalos: new Map([['prueba', 720]]), fuentes: new Map([['prueba', 'Weekendesk']]) });

  it('una vista hace poco dice en qué web y hace cuánto', () => {
    const o = oferta({ vistaUltima: '2026-09-29T08:00:00Z' });
    const html = tarjeta(o, ctx([o]));
    assert.match(html, /Comprobada en Weekendesk hace 2 h/);
    assert.ok(!html.includes('Sin comprobar'));
  });

  it('si hace más de 3 intervalos de su fuente (y al menos un día) que no se ve, avisa', () => {
    const reciente = oferta({ vistaUltima: '2026-09-28T09:00:00Z' }); // 25 h, pero la fuente va cada 12 h: 36 h de margen
    assert.ok(!tarjeta(reciente, ctx([reciente])).includes('Sin comprobar'));
    const vieja = oferta({ vistaUltima: '2026-09-27T09:00:00Z' }); // 49 h
    assert.match(tarjeta(vieja, ctx([vieja])), /⚠️ Sin comprobar en Weekendesk desde hace 2 días: puede haber cambiado o terminado/);
    assert.match(contenidoFicha(vieja, ctx([vieja])), /Sin comprobar en Weekendesk/);
  });

  it('el panel recibe el intervalo de cada fuente', async () => {
    const { escanear } = await import('../src/core/scan-pipeline.js');
    const { AJUSTES } = await import('./ayudas.js');
    const fuente = { id: 'prueba', nombre: 'Prueba', web: 'https://ejemplo.es', modo: 'feed', urls: ['https://ejemplo.es/'], obtener: async () => ({ ofertas: [] }) };
    const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {}, calcularCosteCoche: async () => {}, anadirTiempo: async () => {}, anadirEventos: async () => {} };
    const ajustes = { ...AJUSTES, fuentes: { prueba: { intervaloMin: 90 } } };
    const { salida } = await escanear({ ajustes, fuentes: [fuente], http: { texto: async () => '', json: async () => ({}), esperar: async () => {} }, modulos, opciones: { sinEmails: true }, log: () => {} });
    assert.equal(salida.ofertas.fuentes[0].intervaloMin, 90);
  });
});

describe('calidad: «mínimo histórico» solo con historial suficiente', () => {
  it('con dos días de precios no hay mínimo histórico aunque haya bajado; con una semana y 3 días, sí', async () => {
    const { registrarPrecios } = await import('../src/historial.js');
    const ahora = new Date('2026-09-18T08:00:00Z');
    const historial = {
      'prueba:corta': [['2026-09-16', 120], ['2026-09-17', 110]],
      'prueba:pocos': [['2026-09-01', 120], ['2026-09-17', 110]],
      'prueba:larga': [['2026-09-10', 120], ['2026-09-14', 115], ['2026-09-17', 110]],
    };
    const [corta, pocos, larga] = ['corta', 'pocos', 'larga'].map((id) => oferta({ id: `prueba:${id}`, precio: 100 }));
    registrarPrecios(historial, [corta, pocos, larga], ahora);
    assert.equal(corta.minimoHistorico, false, 'solo 2 días');
    assert.equal(pocos.minimoHistorico, false, 'solo 2 precios');
    assert.equal(larga.minimoHistorico, true);
    assert.equal(corta.bajada, 20, 'la bajada respecto a los últimos 7 días sí se cuenta');
  });
});

describe('calidad: cada etiqueta de chollo se explica con datos', async () => {
  const { motivoChollazo, puntuar } = await import('../src/enriquecer/puntuacion.js');
  const { AJUSTES } = await import('./ayudas.js');

  it('el motivo del chollazo es una frase comprobable', () => {
    const vuelo = oferta({ tipo: 'vuelo', precio: 28, unidad: 'i/v' });
    assert.match(motivoChollazo(vuelo, AJUSTES), /Vuelo de ida y vuelta por 28 €: el límite es \d+ €/);
    const casa = oferta({ tipo: 'hotel', precio: 40, unidad: 'noche' });
    assert.match(motivoChollazo(casa, AJUSTES), /20 € por persona y noche \(repartiendo entre 2 personas\): el límite es \d+ €/);
    const error = oferta({ etiquetas: ['error-tarifa'] });
    assert.equal(motivoChollazo(error, AJUSTES), 'La web lo publica como error de tarifa');
    assert.equal(motivoChollazo(oferta({ tipo: 'hotel', precio: 400, unidad: 'noche' }), AJUSTES), null);
  });

  it('puntuar guarda el motivo y el panel lo enseña', () => {
    const casa = oferta({ tipo: 'hotel', precio: 40, unidad: 'noche' });
    puntuar([casa], AJUSTES);
    assert.equal(casa.chollazo, true);
    assert.match(casa.chollazoMotivo, /por persona y noche/);
    assert.match(tarjeta(casa, ctxPara([casa])), /title="20 € por persona y noche[^"]*">🔥 Chollazo/);
    assert.match(contenidoFicha(casa, ctxPara([casa])), /<dt>Por qué es chollazo<\/dt><dd>20 € por persona y noche/);
  });

  it('el mínimo dice cuántos días de historial lo respaldan y la bajada, desde qué precio', () => {
    const o = oferta({ precio: 100, minimoHistorico: true, bajada: 15 });
    const historial = { [o.id]: [['2026-09-01', 130], ['2026-09-10', 115], ['2026-09-24', 100]] };
    const html = tarjeta(o, ctxPara([o], { historial }));
    assert.match(html, /title="El más bajo desde el mar 1 sep \(3 días con precio; máximo 130\s€\)">Precio más bajo en 23 días/);
    assert.match(html, /title="Ha bajado 15\s€: el precio más alto de los últimos 7 días fue 115\s€">↓ 15\s€/);
  });
});
