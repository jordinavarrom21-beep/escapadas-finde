import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buscarEscapadas, buscarTexto, chollosDeVuelos, crearHash, describirCriterio, destinosDeVuelo, disponibleEn,
  esNovedad, filtrarVuelos, leerFiltrosEscapadas, leerFiltrosVuelos, leerRuta, medirDistancias,
  referenciaNovedades, resumenCalendario, resumenFuentes, urlEditarVigilados, vuelosParaMapa,
} from '../site/js/filtros.js';
import { estadoFinde, findesProximos, proximoPuente } from '../site/js/fechas.js';
import { cuentaAtras, euros } from '../site/js/formato.js';
import { parsearPhoton, urlPhoton } from '../site/js/geo.js';
import { tarjeta } from '../site/js/plantillas.js';
import { resultadosVuelos, vistaCalendario, vistaFuentes } from '../site/js/vistas.js';
import { crearServidor, rutaArchivo } from '../scripts/servir.js';

const leer = (nombre) => JSON.parse(readFileSync(new URL(`./fixtures/panel/${nombre}`, import.meta.url), 'utf8'));
const datos = leer('ofertas.json');
const historial = leer('historial.json');
const { ofertas, origen } = datos;
const AHORA = new Date('2026-09-18T08:00:00Z'); // viernes 10:00 en Madrid
const [finde, siguiente] = datos.findes;
const puente = datos.puentes[0];
const ctxBusqueda = { origen, finde, puente, referencia: null, favoritos: new Set() };
const porId = (id) => ofertas.find((o) => o.id === id);

/** Mismo estado que construye app.js, sin navegador. */
function estadoPanel(d = datos) {
  return {
    datos: d, historial, vigilados: [], ahora: AHORA, hoy: '2026-09-18', findes: d.findes, puente,
    favoritos: new Set(), referencia: null, paginas: new Map(), ubicacion: {},
    temas: new Map(d.temas.map((t) => [t.id, t])),
    fuentes: new Map(d.fuentes.map((f) => [f.id, f.nombre])),
    porId: new Map(d.ofertas.map((o) => [o.id, o])),
    distanciasOrigen: medirDistancias(d.ofertas, null, d.origen),
  };
}

describe('rutas y filtros en la URL', () => {
  it('ida y vuelta del hash, sin valores vacíos y con listas separadas por comas', () => {
    const hash = crearHash('escapadas', { temas: ['spa', 'rural'], max: 80, nuevas: true, fav: false, lugar: 'Sant Cugat del Vallès', km: '' });
    assert.equal(hash, '#/escapadas?temas=spa,rural&max=80&nuevas=1&lugar=Sant%20Cugat%20del%20Vall%C3%A8s');
    assert.deepEqual(leerRuta(hash), { vista: 'escapadas', params: { temas: 'spa,rural', max: '80', nuevas: '1', lugar: 'Sant Cugat del Vallès' } });
    assert.equal(leerRuta('#/inventada?x=1').vista, 'finde');
    assert.equal(leerRuta('').vista, 'finde');
  });

  it('interpreta los filtros con valores por defecto seguros', () => {
    const f = leerFiltrosEscapadas({ temas: 'spa,playa', h: '9', lat: '41.98', noches: '3', orden: 'raro' });
    assert.deepEqual(f.temas, ['spa', 'playa']);
    assert.equal(f.horas, null);
    assert.equal(f.punto, null, 'sin longitud no hay punto');
    assert.equal(f.noches, 3);
    assert.equal(f.orden, 'puntuacion');
    assert.deepEqual(leerFiltrosEscapadas({ lat: '41.98', lon: '2.82', lugar: 'Girona' }).punto, { nombre: 'Girona', lat: 41.98, lon: 2.82 });
    assert.equal(leerFiltrosVuelos({ max: '-5', orden: 'hora' }).max, null);
  });
});

describe('vuelos', () => {
  it('filtra por finde, aeropuerto, horario ideal, precio y país, y ordena por precio', () => {
    const f = { ...leerFiltrosVuelos(), finde: siguiente.id, aero: 'BCN', max: 60 };
    const lista = filtrarVuelos(ofertas, f);
    assert.ok(lista.length > 0);
    assert.ok(lista.every((o) => o.vuelo && o.fechas.findeId === siguiente.id && o.vuelo.origen === 'BCN' && o.precio <= 60));
    assert.deepEqual(lista.map((o) => o.precio), [...lista.map((o) => o.precio)].sort((a, b) => a - b));
    assert.ok(filtrarVuelos(ofertas, { ...f, ideal: true }).every((o) => o.vuelo.horarioIdeal));
    assert.ok(filtrarVuelos(ofertas, { ...leerFiltrosVuelos(), pais: 'Italia' }).every((o) => o.lugar.pais === 'Italia'));
  });

  it('admite el id de un puente en el selector de finde', () => {
    const lista = filtrarVuelos(ofertas, { ...leerFiltrosVuelos(), finde: puente.id });
    assert.ok(lista.length > 0);
    assert.ok(lista.every((o) => o.fechas.puenteId === puente.id));
  });

  it('funciona solo con chollos de vuelos sin campo «vuelo» (Ryanair desactivada)', () => {
    const soloChollos = ofertas.filter((o) => !o.vuelo);
    const f = leerFiltrosVuelos({ finde: finde.id, ideal: '1', max: '30' });
    assert.deepEqual(filtrarVuelos(soloChollos, f), []);
    const chollos = chollosDeVuelos(soloChollos, f);
    assert.ok(chollos.length > 0 && chollos.every((o) => o.tipo === 'vuelo' && o.vuelo === null && o.precio <= 30));

    const html = resultadosVuelos(estadoPanel({ ...datos, ofertas: soloChollos }), { finde: finde.id });
    assert.match(html, /Todavía no hay vuelos con fecha y hora/);
    assert.match(html, /Ryanair<\/strong>: bloqueada \(Su robots\.txt prohíbe \/api/);
    assert.match(html, /falta configurar TRAVELPAYOUTS_TOKEN|falta configurar SERPAPI_KEY/);
    assert.match(html, /Chollos de vuelos de blogs y comunidades/);
  });

  it('agrupa los destinos del mapa quedándose con el vuelo más barato', () => {
    const destinos = destinosDeVuelo(ofertas.filter((o) => o.tipo === 'vuelo'));
    const oporto = destinos.find((d) => d.oferta.lugar.iata === 'OPO');
    const precios = ofertas.filter((o) => o.lugar?.iata === 'OPO').map((o) => o.precio);
    assert.equal(oporto.oferta.precio, Math.min(...precios));
    assert.equal(oporto.total, precios.length);
  });
});

describe('escapadas', () => {
  it('temas en «o», sin vuelos y ordenadas por puntuación', () => {
    const { ofertas: lista } = buscarEscapadas(ofertas, leerFiltrosEscapadas({ temas: 'spa,mascotas' }), ctxBusqueda);
    assert.ok(lista.length >= 2);
    assert.ok(lista.every((o) => o.tipo !== 'vuelo' && (o.temas.includes('spa') || o.temas.includes('mascotas'))));
    assert.ok(lista.every((o, i) => i === 0 || lista[i - 1].puntuacion >= o.puntuacion));
  });

  it('límite en horas: desde el origen usa cocheMin; desde otro punto, línea recta × 1,3 a 80 km/h', () => {
    const desdeOrigen = buscarEscapadas(ofertas, leerFiltrosEscapadas({ h: '1' }), ctxBusqueda).ofertas;
    assert.ok(desdeOrigen.length > 0 && desdeOrigen.every((o) => o.cocheMin <= 60));
    assert.ok(desdeOrigen.some((o) => o.lugar.nombre === 'Sitges'));

    const [girona] = parsearPhoton(leer('photon-girona.json'));
    const params = { lugar: girona.nombre, lat: String(girona.lat), lon: String(girona.lon), h: '1', orden: 'distancia' };
    const { ofertas: cerca, distancias } = buscarEscapadas(ofertas, leerFiltrosEscapadas(params), ctxBusqueda);
    const nombres = cerca.map((o) => o.lugar.nombre);
    assert.ok(nombres.includes('Girona') && nombres.includes('Besalú'));
    assert.ok(!nombres.includes('Sitges'), 'Sitges queda a más de 1 h de Girona');
    assert.equal(nombres[0], 'Girona', 'ordenadas por distancia');
    assert.ok(cerca.every((o) => distancias.get(o.id).estimado));
  });

  it('límite en km y orden por precio con los precios nulos al final', () => {
    const f = leerFiltrosEscapadas({ km: '50', orden: 'precio' });
    const { ofertas: lista, distancias } = buscarEscapadas(ofertas, f, ctxBusqueda);
    assert.ok(lista.length > 0 && lista.every((o) => distancias.get(o.id).km <= 50));
    const precios = lista.map((o) => o.precio ?? Infinity);
    assert.deepEqual(precios, [...precios].sort((a, b) => a - b));
  });

  it('«este finde» y «puente» incluyen las de fechas flexibles vigentes y excluyen las de otras fechas', () => {
    const cabana = porId('buscounchollo:dormir-en-una-cabana-en-los-arboles-en-l');
    const sitges = porId('chollometro:hotel-en-sitges-para-el-festival-de-cine');
    const delta = porId('viajerospiratas:delta-del-ebro-en-el-puente-de-la-merce-');
    const flexible = ofertas.find((o) => o.tipo !== 'vuelo' && !o.fechas.salida && !o.caduca);
    const periodo = { id: finde.id, desde: finde.viernes };
    assert.equal(disponibleEn(cabana, periodo), true);
    assert.equal(disponibleEn(sitges, periodo), false);
    assert.equal(disponibleEn(flexible, periodo), true);
    assert.equal(disponibleEn({ ...flexible, caduca: '2026-09-10T10:00:00Z' }, periodo), false);
    const delPuente = buscarEscapadas(ofertas, leerFiltrosEscapadas({ cuando: 'puente' }), ctxBusqueda).ofertas;
    assert.ok(delPuente.includes(delta) && !delPuente.includes(sitges));
  });

  it('solo novedades y solo favoritos', () => {
    const referencia = '2026-09-17T12:00:00Z';
    const nuevas = buscarEscapadas(ofertas, leerFiltrosEscapadas({ nuevas: '1' }), { ...ctxBusqueda, referencia }).ofertas;
    assert.ok(nuevas.length > 0 && nuevas.every((o) => esNovedad(o, referencia)));
    const favoritos = new Set([ofertas.find((o) => o.tipo === 'hotel').id]);
    assert.equal(buscarEscapadas(ofertas, leerFiltrosEscapadas({ fav: '1' }), { ...ctxBusqueda, favoritos }).ofertas.length, 1);
  });

  it('el mapa aplica a los vuelos los filtros comunes (precio y fechas) pero no el de distancia', () => {
    const f = leerFiltrosEscapadas({ max: '25', h: '1' });
    const vuelos = vuelosParaMapa(ofertas, f, ctxBusqueda);
    assert.ok(vuelos.length > 0 && vuelos.every((o) => o.tipo === 'vuelo' && o.precio <= 25));
  });
});

describe('búsqueda, novedades y resúmenes', () => {
  it('busca sin tildes ni mayúsculas en título, lugar y destino', () => {
    const lista = buscarTexto(ofertas, { q: 'BESALU' }, null);
    assert.ok(lista.some((o) => o.lugar?.nombre === 'Besalú'));
    assert.ok(buscarTexto(ofertas, { q: 'opo' }, null).some((o) => o.vuelo?.destino === 'OPO'));
  });

  it('la primera visita toma como novedades las últimas 24 h', () => {
    assert.equal(referenciaNovedades(null, '2026-09-18T05:30:00.000Z'), '2026-09-17T05:30:00.000Z');
    assert.equal(referenciaNovedades('2026-09-10T00:00:00Z', '2026-09-18T05:30:00Z'), '2026-09-10T00:00:00Z');
    assert.equal(esNovedad({ vistaPrimera: null }, '2026-09-10T00:00:00Z'), false);
  });

  it('calendario de 12 findes con puentes resaltados y el vuelo más barato', () => {
    const findes = findesProximos(12, AHORA);
    const resumen = resumenCalendario(ofertas, findes, datos.puentes);
    assert.equal(resumen.length, 12);
    assert.equal(resumen[1].puente?.id, 'puente-2026-09-24');
    assert.equal(resumen[3].puente?.id, 'puente-2026-10-10');
    const baratos = ofertas.filter((o) => o.vuelo && o.fechas.findeId === findes[0].id).map((o) => o.precio);
    assert.equal(resumen[0].vuelo.precio, Math.min(...baratos));
    assert.match(vistaCalendario(estadoPanel()), /finde-celda--puente[^]*La Mercè/);
  });

  it('estado de las fuentes: las bloqueadas y desactivadas no cuentan como fallo y se muestra el motivo', () => {
    assert.deepEqual(resumenFuentes(datos.fuentes), { activas: 7, ok: 6, conError: 1, inactivas: 2 });
    const html = vistaFuentes(estadoPanel());
    assert.match(html, /Bloqueada<\/span><\/td>\s*<td data-etiqueta="Detalle">Su robots\.txt prohíbe \/api/);
    assert.match(html, /HTTP 403 en www\.nomolesten\.com/);
  });

  it('describe los vigilados y enlaza a la edición en GitHub', () => {
    const [, , spa, puentes] = leer('vigilados.json').vigilados;
    assert.deepEqual(describirCriterio(spa, { temas: datos.temas, origen }), ['🧖 Relax y spa', `hasta ${euros(70)}`, 'a menos de 2 h en coche']);
    assert.ok(describirCriterio(puentes, { temas: datos.temas, origen }).includes('a menos de 300 km de Barcelona'));
    assert.equal(urlEditarVigilados({ hostname: 'jordi.github.io', pathname: '/escapadas-finde/' }),
      'https://github.com/jordi/escapadas-finde/edit/main/config/vigilados.json');
    assert.equal(urlEditarVigilados({ hostname: 'localhost', pathname: '/' }), null);
  });
});

describe('fechas, formato, geocodificación y plantillas', () => {
  it('cuenta atrás hasta el viernes a las 15:00 y próximo puente', () => {
    assert.deepEqual(estadoFinde(AHORA), { esFinde: false, faltaMs: 5 * 3_600_000 });
    assert.equal(cuentaAtras(5 * 3_600_000), '5 h 0 min');
    assert.equal(estadoFinde(new Date('2026-09-18T14:00:00Z')).esFinde, true);
    assert.equal(proximoPuente(datos.puentes, '2026-09-28').id, 'puente-2026-10-10');
  });

  it('Photon: URL con idioma admitido y sugerencias sin repetidas', () => {
    assert.match(urlPhoton('Girona', origen), /lang=default&limit=5&lat=41\.39&lon=2\.17$/);
    const sugerencias = parsearPhoton(leer('photon-girona.json'));
    assert.equal(sugerencias[0].nombre, 'Girona');
    assert.ok(Math.abs(sugerencias[0].lat - 41.98) < 0.01);
    assert.equal(new Set(sugerencias.map((s) => `${s.nombre}|${s.detalle}`)).size, sugerencias.length);
  });

  it('las tarjetas escapan el HTML, descartan enlaces no http y distinguen billetes de chollos', () => {
    const ctx = { temas: new Map(), fuentes: new Map(), favoritos: new Set(), historial };
    const maliciosa = { ...porId('chollometro:hotel-en-sitges-para-el-festival-de-cine'), titulo: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' };
    const html = tarjeta(maliciosa, ctx);
    assert.ok(!html.includes('<img src=x') && html.includes('&lt;img src=x'));
    assert.ok(!html.includes('javascript:'));
    const vuelo = ofertas.find((o) => o.vuelo && historial[o.id]?.length >= 2);
    assert.match(tarjeta(vuelo, ctx), /class="billete"[^]*<svg class="minigrafica"/);
    assert.match(tarjeta(ofertas.find((o) => o.tipo === 'vuelo' && !o.vuelo), ctx), /class="tarjeta"/);
  });
});

describe('servidor local', () => {
  it('no deja salir de la carpeta servida', () => {
    assert.equal(rutaArchivo('/../package.json'), null);
    assert.equal(rutaArchivo('/data/../../../package.json', { ejemplo: true }), null);
    assert.match(rutaArchivo('/data/ofertas.json', { ejemplo: true }), /fixtures[\\/]panel[\\/]ofertas\.json$/);
  });

  it('con --ejemplo sirve el panel y los datos de ejemplo', async () => {
    const servidor = crearServidor({ ejemplo: true });
    await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    try {
      const indice = await fetch(`${base}/`);
      assert.equal(indice.status, 200);
      assert.match(indice.headers.get('content-type'), /text\/html/);
      const json = await (await fetch(`${base}/data/ofertas.json`)).json();
      assert.equal(json.ofertas.length, ofertas.length);
      assert.equal((await fetch(`${base}/no-existe.js`)).status, 404);
    } finally {
      servidor.close();
    }
  });
});
