/**
 * Cada orden de «Ordenar por» ordena de verdad, y con «Cerca de…» el radio y la distancia se
 * miden desde ese punto mientras el coste del viaje y «Más cómodo» siguen siendo desde tu salida.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALOJAMIENTOS, ORDENES_ESCAPADAS, buscarEscapadas, leerFiltrosEscapadas, medirDistancias, referenciaPrecisa } from '../site/js/filtros.js';
import { ETIQUETAS_ORDEN, contextoBusqueda, ctxTarjetas } from '../site/js/vistas-comun.js';
import { costeDe } from '../site/js/plantillas.js';

const datos = JSON.parse(readFileSync(new URL('./fixtures/panel/ofertas.json', import.meta.url), 'utf8'));
const conCoche = { ...datos, coche: { consumoL100km: 6.5, precioLitro: 1.8 } };
const GIRONA = { nombre: 'Girona', lat: 41.9794, lon: 2.8214 };
const TARRAGONA = { nombre: 'Tarragona', lat: 41.1189, lon: 1.2445 };

function estado(salida = null) {
  return {
    datos: conCoche, historial: {}, ahora: new Date('2026-09-18T08:00:00Z'), hoy: '2026-09-18', findes: datos.findes,
    puente: datos.puentes[0], favoritos: new Set(), descartadas: new Set(), referencia: null, paginas: new Map(),
    temas: new Map(datos.temas.map((t) => [t.id, t])), fuentes: new Map(datos.fuentes.map((f) => [f.id, f.nombre])),
    salida, viaje: { viajeros: 2, noches: 2 }, distanciasOrigen: medirDistancias(datos.ofertas, salida, datos.origen),
  };
}
const buscar = (params, salida = null) => buscarEscapadas(conCoche.ofertas, leerFiltrosEscapadas(params), contextoBusqueda(estado(salida)));

/** Sin los null (van al final), la lista queda ordenada según `cmp`. */
function ordenada(valores, cmp) {
  const conValor = valores.filter((v) => v != null);
  assert.deepEqual(conValor, [...conValor].sort(cmp));
  const primerNull = valores.findIndex((v) => v == null);
  if (primerNull >= 0) assert.ok(valores.slice(primerNull).every((v) => v == null), 'lo que no tiene valor, al final');
}
const subiendo = (a, b) => a - b;
const bajando = (a, b) => b - a;

describe('ordenar escapadas', () => {
  it('cada orden tiene su nombre en el desplegable', () => {
    for (const orden of ORDENES_ESCAPADAS) assert.ok(ETIQUETAS_ORDEN[orden], orden);
  });

  it('cada orden es monótono en lo que dice ordenar', () => {
    const casos = {
      // «Viaje más barato»: por persona y noche, para comparar estancias de distinta duración.
      total: (r) => [r.ofertas.map((o) => r.costes.get(o.id).porPersonaNoche), subiendo],
      persona: (r) => [r.ofertas.map((o) => r.costes.get(o.id).porPersona), subiendo],
      comodo: (r) => [r.ofertas.map((o) => r.desdeSalida.get(o.id)?.minutos), subiendo],
      noche: (r) => [r.ofertas.map((o) => o.precioNoche), subiendo],
      // Solo cuenta la comparación con ofertas de verdad parecidas (la de la insignia).
      ahorro: (r) => [r.ofertas.map((o) => referenciaPrecisa(o)?.ahorroPct), bajando],
      valoracion: (r) => [r.ofertas.map((o) => o.valoracion?.nota), bajando],
      distancia: (r) => [r.ofertas.map((o) => r.distancias.get(o.id)?.minutos), subiendo],
      alojamiento: (r) => [r.ofertas.map((o) => (ALOJAMIENTOS.includes(o.alojamiento) ? ALOJAMIENTOS.indexOf(o.alojamiento) : null)), subiendo],
      puntuacion: (r) => [r.ofertas.map((o) => o.puntuacion), bajando],
    };
    for (const [orden, valores] of Object.entries(casos)) {
      const r = buscar({ orden });
      assert.ok(r.ofertas.length > 1, orden);
      const [lista, cmp] = valores(r);
      ordenada(lista, cmp);
    }
  });

  it('«precio publicado» ya no es un orden: un enlace de antes ordena por viaje más barato', () => {
    assert.ok(!ORDENES_ESCAPADAS.includes('precio'));
    assert.equal(leerFiltrosEscapadas({ orden: 'precio' }).orden, 'total');
    assert.equal(leerFiltrosEscapadas({ orden: 'inventado' }).orden, 'puntuacion');
  });

  it('el orden por tipo agrupa los alojamientos', () => {
    const tipos = buscar({ orden: 'alojamiento' }).ofertas.map((o) => o.alojamiento).filter(Boolean);
    const vistos = [];
    for (const t of tipos) if (vistos.at(-1) !== t) vistos.push(t);
    assert.equal(new Set(vistos).size, vistos.length, 'cada tipo sale de una vez, sin intercalarse');
  });
});

describe('buscar desde tu salida y cerca de otro punto', () => {
  it('cambiar la salida cambia distancias, el filtro de horas y el coste del coche', () => {
    const desdeBcn = buscar({ h: '1' });
    assert.ok(desdeBcn.ofertas.length > 0);
    const desdeGirona = buscar({ h: '1' }, GIRONA);
    const ids = (r) => new Set(r.ofertas.map((o) => o.id));
    assert.notDeepEqual(ids(desdeBcn), ids(desdeGirona), 'a una hora de Girona no es lo mismo que de Barcelona');
    for (const o of desdeGirona.ofertas) assert.ok(desdeGirona.distancias.get(o.id).minutos <= 60);
  });

  it('con «Cerca de…» el radio y «Distancia» son desde el punto; la gasolina y «Más cómodo», desde tu salida', () => {
    const params = { lugar: 'Tarragona', lat: String(TARRAGONA.lat), lon: String(TARRAGONA.lon), km: '60' };
    const r = buscar({ ...params, orden: 'total' }, GIRONA);
    assert.ok(r.ofertas.length > 0);
    for (const o of r.ofertas) assert.ok(r.distancias.get(o.id).km <= 60, 'dentro del radio alrededor de Tarragona');
    const desdeGirona = medirDistancias(conCoche.ofertas, GIRONA, datos.origen);
    for (const o of r.ofertas) assert.equal(r.desdeSalida.get(o.id).km, desdeGirona.get(o.id).km);
    // La tarjeta (ctx con distancias desde el punto) cuenta la gasolina desde Girona, como la búsqueda.
    const ctx = ctxTarjetas(estado(GIRONA), { distancias: r.distancias, desde: 'Tarragona' });
    for (const o of r.ofertas) assert.equal(costeDe(o, ctx).total, r.costes.get(o.id).total, o.id);
    const comodo = buscar({ ...params, orden: 'comodo' }, GIRONA);
    ordenada(comodo.ofertas.map((o) => comodo.desdeSalida.get(o.id)?.minutos), subiendo);
  });
});

describe('distancia: lo que dicen los filtros', () => {
  const params = { lugar: 'Girona', lat: String(GIRONA.lat), lon: String(GIRONA.lon) };

  it('con «Cerca de…» y sin orden elegido, lo más cerca de ese sitio primero', () => {
    assert.equal(leerFiltrosEscapadas(params).orden, 'distancia');
    const r = buscar(params);
    ordenada(r.ofertas.map((o) => r.distancias.get(o.id)?.minutos), subiendo);
    // «Recomendadas» elegida a mano se respeta.
    assert.equal(leerFiltrosEscapadas({ ...params, orden: 'puntuacion' }).orden, 'puntuacion');
    assert.equal(leerFiltrosEscapadas({}).orden, 'puntuacion');
  });

  it('«Distancia máx.» es por carretera desde cualquier sitio (la línea recta × 1,3 si no se sabe)', () => {
    const r = buscar({ ...params, km: '60' });
    assert.ok(r.ofertas.length > 0);
    for (const o of r.ofertas) assert.ok(r.distancias.get(o.id).km * 1.3 <= 60, o.id);
    // Las que están a menos de 60 km en línea recta pero a más por carretera ya no entran.
    const todas = buscar(params);
    const lejos = todas.ofertas.filter((o) => { const d = todas.distancias.get(o.id); return d && d.km <= 60 && d.km * 1.3 > 60; });
    assert.ok(lejos.length > 0);
    for (const o of lejos) assert.ok(!r.ofertas.some((x) => x.id === o.id), `${o.id} está a más de 60 km por carretera`);
  });

  it('el círculo del mapa es el radio en línea recta de esos kilómetros por carretera', async () => {
    const { radioBusquedaKm } = await import('../site/js/filtros.js');
    assert.equal(Math.round(radioBusquedaKm(leerFiltrosEscapadas({ km: '130' }))), 100);
  });
});

describe('ordenar planes', async () => {
  const { ORDENES_ACTIVIDADES, buscarActividades, leerFiltrosActividades } = await import('../site/js/filtros.js');
  const { resultadosActividades } = await import('../site/js/vistas.js');
  const planes = (orden) => buscarActividades(conCoche.ofertas, leerFiltrosActividades({ orden }), contextoBusqueda(estado()));

  it('cada orden es monótono en lo que dice ordenar', () => {
    const distancias = estado().distanciasOrigen;
    const casos = {
      precio: [(o) => o.precio, subiendo],
      valoracion: [(o) => o.valoracion?.nota, bajando],
      distancia: [(o) => distancias.get(o.id)?.minutos, subiendo],
      puntuacion: [(o) => o.puntuacion, bajando],
    };
    for (const [orden, [valor, cmp]] of Object.entries(casos)) {
      const lista = planes(orden);
      assert.ok(lista.length > 1, orden);
      ordenada(lista.map(valor), cmp);
    }
  });

  it('el orden va encima de los resultados, a un toque, como en Escapadas', () => {
    const html = resultadosActividades(estado(), { orden: 'precio' });
    const nav = html.match(/<nav class="orden-rapido[^]*?<\/nav>/)?.[0] ?? '';
    assert.match(nav, /chip--elegido" aria-current="true" href="#\/planes\?orden=precio">Más baratos/);
    assert.match(nav, /href="#\/planes\?orden=distancia">Más cerca/);
    assert.match(nav, /href="#\/planes">Recomendados/);
    for (const orden of ORDENES_ACTIVIDADES) assert.ok(nav.includes(orden === 'puntuacion' ? 'href="#/planes"' : `orden=${orden}`), orden);
  });
});

describe('fechas al revés', () => {
  it('«entre el 18 y el 16» se lee como «entre el 16 y el 18»', () => {
    const f = leerFiltrosEscapadas({ desde: '2026-10-18', hasta: '2026-10-16' });
    assert.deepEqual([f.desde, f.hasta], ['2026-10-16', '2026-10-18']);
    assert.deepEqual([leerFiltrosEscapadas({ hasta: '2026-10-16' }).desde, leerFiltrosEscapadas({ hasta: '2026-10-16' }).hasta], ['', '2026-10-16']);
  });
});

describe('islas', async () => {
  const { minutosEnCoche } = await import('../site/js/geo.js');
  const origen = datos.origen;
  const hotelEnMallorca = { id: 'x', tipo: 'hotel', lugar: { nombre: 'Sóller', lat: 39.766, lon: 2.715 } };
  it('a una isla no se va en coche desde la península, salgas de donde salgas', () => {
    assert.equal(minutosEnCoche(hotelEnMallorca, null, origen), null);
    assert.equal(minutosEnCoche(hotelEnMallorca, GIRONA, origen), null);
  });
  it('dentro de la misma isla, sí', () => {
    assert.ok(minutosEnCoche(hotelEnMallorca, { nombre: 'Palma', lat: 39.57, lon: 2.65 }, origen) > 0);
  });
});

describe('buscar un pueblo', async () => {
  const { lugarDeConsulta } = await import('../site/js/filtros.js');
  const { resultadosEscapadas } = await import('../site/js/vistas.js');
  it('reconoce el lugar (sin tildes ni mayúsculas) y no inventa uno que no está', () => {
    assert.equal(lugarDeConsulta(datos.ofertas, 'tossa de mar')?.nombre, 'Tossa de Mar');
    assert.equal(lugarDeConsulta(datos.ofertas, 'spa'), null);
  });
  it('avisa de lo que hay alrededor que no lleva el nombre en el título, con enlace a «Cerca de…»', () => {
    const html = resultadosEscapadas(estado(), { q: 'tossa de mar' });
    assert.match(html, /más a menos de 30 km de Tossa de Mar[^]*href="#\/escapadas\?lugar=Tossa%20de%20Mar&amp;lat=[\d.]+&amp;lon=[\d.]+&amp;km=30"/);
  });
});

describe('sin resultados para un hotel concreto', async () => {
  const { resultadosEscapadas, resultadosBuscar } = await import('../site/js/vistas.js');
  it('dice que no está entre lo vigilado y enlaza a buscarlo fuera (sin las palabras con «-»)', () => {
    const html = resultadosBuscar(estado(), { q: 'hotel blancafort -spa' });
    assert.match(html, /No está entre las ofertas que vigilamos/);
    assert.match(html, /href="https:\/\/www\.booking\.com\/searchresults\.es\.html\?ss=hotel%20blancafort"/);
    assert.match(resultadosEscapadas(estado(), { q: 'hotel blancafort' }), /«hotel blancafort» en Google/);
  });
});
