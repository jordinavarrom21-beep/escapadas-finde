import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  actividadesCerca, actividadesPara, analizarConsulta, buscarActividades, buscarEscapadas, buscarTexto,
  chollosDeVuelos, crearHash, criterioVigilado, describirCriterio, destinosDeVuelo, diasAPedir, disponibleEn,
  duracionActividad, esActividad, esNovedad, filtrarVuelos, leerFiltrosActividades, leerFiltrosComunes,
  leerFiltrosEscapadas, leerFiltrosVuelos, leerRuta, medirDistancias, perfilFavoritos, periodoFinde,
  planesSorpresa, recomendadas, referenciaNovedades, resumenCalendario, resumenFuentes, resumenPuentes,
  alFinalSinComprobar, coincideTexto, conFaltas, distanciaPalabras, filtrosActivos, sinComprobar, urlEditarVigilados, vuelosParaMapa,
} from '../site/js/filtros.js';
import { estadoFinde, findesProximos, proximoPuente } from '../site/js/fechas.js';
import { cuentaAtras, euros } from '../site/js/formato.js';
import { parsearPhoton, urlPhoton } from '../site/js/geo.js';
import { contenidoFicha, tarjeta } from '../site/js/plantillas.js';
import {
  avisosDeBusquedas, contenidoSorpresa, contextoBusqueda, ocultas, resultadosBuscar, resultadosEscapadas, resultadosDeBusqueda, resultadosVuelos, totalNovedadesGuardadas, vistaMis, vistaVuelos, vistaActividades, vistaCalendario, vistaEscapadas, vistaFinde,
  vistaFuentes, vistaPuentes,
} from '../site/js/vistas.js';
import { crearServidor, rutaArchivo } from '../scripts/servir.js';

const leer = (nombre) => JSON.parse(readFileSync(new URL(`./fixtures/panel/${nombre}`, import.meta.url), 'utf8'));
const datos = leer('ofertas.json');
const historial = leer('historial.json');
const { ofertas, origen } = datos;
const AHORA = new Date('2026-09-18T08:00:00Z'); // viernes 10:00 en Madrid
const HOY = '2026-09-18';
const [finde, siguiente] = datos.findes;
const puente = datos.puentes[0];
const temas = new Map(datos.temas.map((t) => [t.id, t]));
const ctxBusqueda = {
  origen, finde, puente, findes: datos.findes, puentes: datos.puentes, temas,
  referencia: null, favoritos: new Set(), descartadas: new Set(),
};
const porId = (id) => ofertas.find((o) => o.id === id);
const buscar = (params, extra = {}) => buscarEscapadas(ofertas, leerFiltrosEscapadas(params), { ...ctxBusqueda, ...extra }).ofertas;
const nombres = (lista) => lista.map((o) => o.lugar?.nombre);
const ids = (lista) => lista.map((o) => o.id).sort();
/**
 * El filtro devuelve exactamente las de `base` que cumplen la condición (ni más ni menos)
 * y alguna hay: un `[].every()` es true y dejaría pasar un filtro que no devuelve nada.
 */
function soloLasQue(lista, base, cumple) {
  assert.ok(lista.length > 0, 'la fixture tiene ofertas que cumplen el filtro');
  assert.deepEqual(ids(lista), ids(base.filter(cumple)));
}

/** Mismo estado que construye app.js, sin navegador. */
function estadoPanel(d = datos) {
  return {
    datos: d, historial, vigilados: [], ahora: AHORA, hoy: HOY, findes: d.findes, puente,
    favoritos: new Set(), descartadas: new Set(), busquedas: [], salto: 0,
    referencia: null, paginas: new Map(), ubicacion: {}, temas,
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
    assert.equal(leerRuta('#/puentes').vista, 'puentes');
    assert.equal(leerRuta('').vista, 'finde');
  });

  it('interpreta los filtros con valores por defecto seguros', () => {
    const f = leerFiltrosEscapadas({ temas: 'spa,playa', h: '9', lat: '41.98', noches: '3', orden: 'raro', regimen: 'lujo', aloj: 'iglu', nota: '-2', desde: 'ayer' });
    assert.deepEqual(f.temas, ['spa', 'playa']);
    assert.equal(f.horas, null);
    assert.equal(f.punto, null, 'sin longitud no hay punto');
    assert.equal(f.noches, 3);
    assert.equal(f.orden, 'puntuacion');
    assert.equal(f.regimen, '', 'un régimen inventado no filtra');
    assert.equal(f.alojamiento, '');
    assert.equal(f.nota, null);
    assert.equal(f.desde, '', 'las fechas mal escritas se ignoran');
    assert.deepEqual(leerFiltrosEscapadas({ lat: '41.98', lon: '2.82', lugar: 'Girona' }).punto, { nombre: 'Girona', lat: 41.98, lon: 2.82 });
    assert.equal(leerFiltrosVuelos({ max: '-5', orden: 'hora' }).max, null);
  });
});

describe('vuelos', () => {
  it('filtra por finde, aeropuerto, horario ideal, precio y país, y ordena por precio', () => {
    const f = { ...leerFiltrosVuelos(), finde: siguiente.id, aero: 'BCN', max: 60 };
    const lista = filtrarVuelos(ofertas, f, ctxBusqueda);
    assert.ok(lista.length > 0);
    assert.ok(lista.every((o) => o.vuelo && o.fechas.findeId === siguiente.id && o.vuelo.origen === 'BCN' && o.precio <= 60));
    assert.deepEqual(lista.map((o) => o.precio), [...lista.map((o) => o.precio)].sort((a, b) => a - b));
    soloLasQue(filtrarVuelos(ofertas, { ...f, ideal: true }, ctxBusqueda), filtrarVuelos(ofertas, f, ctxBusqueda), (o) => o.vuelo.horarioIdeal);
    const todosVuelos = filtrarVuelos(ofertas, leerFiltrosVuelos(), ctxBusqueda);
    soloLasQue(filtrarVuelos(ofertas, { ...leerFiltrosVuelos(), pais: 'Italia' }, ctxBusqueda), todosVuelos, (o) => o.lugar.pais === 'Italia');
  });

  it('admite el id de un puente en el selector de finde', () => {
    const lista = filtrarVuelos(ofertas, { ...leerFiltrosVuelos(), finde: puente.id }, ctxBusqueda);
    assert.ok(lista.length > 0);
    assert.ok(lista.every((o) => o.fechas.puenteId === puente.id));
  });

  it('también aplica a los vuelos los filtros de chollo (chollazo, bajada y puntuación)', () => {
    const chollazos = filtrarVuelos(ofertas, leerFiltrosVuelos({ cho: '1' }), ctxBusqueda);
    assert.ok(chollazos.length > 0 && chollazos.every((o) => o.chollazo));
    const vuelos = filtrarVuelos(ofertas, leerFiltrosVuelos(), ctxBusqueda);
    soloLasQue(filtrarVuelos(ofertas, leerFiltrosVuelos({ pts: '80' }), ctxBusqueda), vuelos, (o) => o.puntuacion >= 80);
    soloLasQue(filtrarVuelos(ofertas, leerFiltrosVuelos({ baja: '1' }), ctxBusqueda), vuelos, (o) => o.bajada > 0);
  });

  it('funciona solo con chollos de vuelos sin campo «vuelo» (Ryanair desactivada)', () => {
    const soloChollos = ofertas.filter((o) => !o.vuelo);
    const f = leerFiltrosVuelos({ finde: finde.id, ideal: '1', max: '30' });
    assert.deepEqual(filtrarVuelos(soloChollos, f, ctxBusqueda), []);
    const chollos = chollosDeVuelos(soloChollos, f, ctxBusqueda);
    assert.ok(chollos.length > 0 && chollos.every((o) => o.tipo === 'vuelo' && o.vuelo === null && o.precio <= 30));

    // Sin vuelos con fecha, la pestaña es «Chollos de vuelos»: sin filtros de finde, aeropuerto
    // ni horario (no se aplicarían) y sin un aviso vacío delante de lo que sí hay.
    const e = estadoPanel({ ...datos, ofertas: soloChollos });
    const vista = vistaVuelos(e, {});
    assert.match(vista, /<h1 class="titulo-vista" tabindex="-1">Chollos de vuelos<\/h1>/);
    assert.match(vista, /fechas flexibles/);
    assert.ok(!/name="finde"|name="aero"|name="ideal"/.test(vista));
    assert.match(vista, /name="mios"/);
    const html = resultadosVuelos(e, {});
    assert.match(html, /data-resumen="\d+ chollos? de vuelos/);
    assert.ok(!/Todavía no hay vuelos con fecha|Vuelos con fecha y hora/.test(html));
    assert.match(html, /data-lista="chollos"/);
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
    const lista = buscar({ temas: 'spa,mascotas' });
    assert.ok(lista.length >= 2);
    assert.ok(lista.every((o) => o.tipo !== 'vuelo' && (o.temas.includes('spa') || o.temas.includes('mascotas'))));
    assert.ok(lista.every((o, i) => i === 0 || lista[i - 1].puntuacion >= o.puntuacion));
  });

  it('límite en horas: desde el origen usa cocheMin; desde otro punto, línea recta × 1,3 a 80 km/h', () => {
    const desdeOrigen = buscar({ h: '1' });
    assert.ok(desdeOrigen.length > 0 && desdeOrigen.every((o) => o.cocheMin <= 60));
    assert.ok(nombres(desdeOrigen).includes('Sitges'));

    const [girona] = parsearPhoton(leer('photon-girona.json'));
    const params = { lugar: girona.nombre, lat: String(girona.lat), lon: String(girona.lon), h: '1', orden: 'distancia' };
    const { ofertas: cerca, distancias } = buscarEscapadas(ofertas, leerFiltrosEscapadas(params), ctxBusqueda);
    assert.ok(nombres(cerca).includes('Girona') && nombres(cerca).includes('Besalú'));
    assert.ok(!nombres(cerca).includes('Sitges'), 'Sitges queda a más de 1 h de Girona');
    assert.equal(nombres(cerca)[0], 'Girona', 'ordenadas por distancia');
    assert.ok(cerca.every((o) => distancias.get(o.id).estimado));
  });

  it('límite en km por carretera y orden por precio con los precios nulos al final', () => {
    const f = leerFiltrosEscapadas({ km: '60', orden: 'precio' });
    const { ofertas: lista } = buscarEscapadas(ofertas, f, ctxBusqueda);
    assert.ok(lista.length > 0 && lista.every((o) => !(o.cocheKm > 60)));
    assert.ok(!lista.includes(porId('chollometro:besalu-casa-rural-para-6-personas-por-18')), 'Besalú está a 128 km');
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
    const delPuente = buscar({ cuando: 'puente' });
    assert.ok(delPuente.includes(delta) && !delPuente.includes(sitges));
  });

  it('solo novedades y solo favoritos', () => {
    const referencia = '2026-09-17T12:00:00Z';
    const nuevas = buscar({ nuevas: '1' }, { referencia });
    assert.ok(nuevas.length > 0 && nuevas.every((o) => esNovedad(o, referencia)));
    const favoritos = new Set([ofertas.find((o) => o.tipo === 'hotel').id]);
    assert.equal(buscar({ fav: '1' }, { favoritos }).length, 1);
  });

  it('el mapa aplica a los vuelos los filtros comunes (precio y fechas) pero no el de distancia', () => {
    const f = leerFiltrosEscapadas({ max: '25', h: '1' });
    const vuelos = vuelosParaMapa(ofertas, f, ctxBusqueda);
    assert.ok(vuelos.length > 0 && vuelos.every((o) => o.tipo === 'vuelo' && o.precio <= 25));
  });
});

describe('orden a un toque', () => {
  it('encima de los resultados, con el activo marcado y sin perder los filtros', () => {
    const html = resultadosEscapadas(estadoPanel(), { cuando: 'finde', orden: 'noche' });
    const nav = html.match(/<nav class="orden-rapido[^]*?<\/nav>/)?.[0] ?? '';
    assert.match(nav, /class="chip chip--elegido" aria-current="true" href="#\/escapadas\?cuando=finde&orden=noche">Más baratas por noche/);
    assert.match(nav, /href="#\/escapadas\?cuando=finde&orden=comodo">Más cerca/);
    assert.match(nav, /href="#\/escapadas\?cuando=finde">Recomendadas/, 'la recomendada es la de siempre: sin «orden»');
  });
});

describe('filtros nuevos de escapadas', () => {
  it('precio por persona y noche, descuento, bajada, mínimo histórico, chollazo y puntuación', () => {
    const baratas = buscar({ pnMax: '25' });
    assert.ok(baratas.length > 0 && baratas.every((o) => o.precioNoche <= 25));
    const todas = buscar({});
    soloLasQue(buscar({ pnMin: '60' }), todas, (o) => o.precioNoche >= 60);
    assert.equal(buscar({ pnMin: '30', pnMax: '25' }).length, 0);
    soloLasQue(buscar({ dto: '35' }), todas, (o) => o.descuento >= 35);
    soloLasQue(buscar({ baja: '1' }), todas, (o) => o.bajada > 0);
    soloLasQue(buscar({ hist: '1' }), todas, (o) => o.minimoHistorico);
    soloLasQue(buscar({ cho: '1' }), todas, (o) => o.chollazo);
    soloLasQue(buscar({ pts: '60' }), todas, (o) => o.puntuacion >= 60);
  });

  it('alojamiento, valoración mínima y régimen mínimo (media pensión o mejor)', () => {
    const rurales = buscar({ aloj: 'casa-rural' });
    assert.ok(rurales.length > 0 && rurales.every((o) => o.alojamiento === 'casa-rural'));
    const valoradas = buscar({ nota: '9' });
    assert.ok(valoradas.length > 0 && valoradas.every((o) => o.valoracion.nota >= 9));
    const pension = buscar({ regimen: 'media-pension' });
    assert.ok(pension.length > 0);
    assert.ok(pension.every((o) => ['media-pension', 'pension-completa', 'todo-incluido'].includes(o.regimen)));
  });

  it('país, región y «sin coche» (avión, tren, bus o ferry)', () => {
    const girona = buscar({ pais: 'España', region: 'Girona' });
    assert.ok(girona.length > 0 && girona.every((o) => o.lugar.region === 'Girona' && o.lugar.pais === 'España'));
    const sinCoche = buscar({ sincoche: '1' });
    assert.ok(sinCoche.length > 0 && sinCoche.every((o) => ['avion', 'tren', 'bus', 'ferry'].includes(o.transporte)));
  });

  it('noches exactas, escapada clásica de finde y listas negras de temas y destinos', () => {
    soloLasQue(buscar({ noches: '1' }), buscar({}), (o) => o.noches === 1);
    const clasicas = buscar({ clasica: '1' });
    assert.ok(clasicas.length > 0 && clasicas.every((o) => o.noches === 2));
    const sinSpa = buscar({ notemas: 'spa,playa' });
    assert.ok(sinSpa.length > 0 && !sinSpa.some((o) => o.temas.includes('spa') || o.temas.includes('playa')));
    assert.ok(!nombres(buscar({ nodest: 'Sitges,Girona' })).some((n) => ['Sitges', 'Girona'].includes(n)));
  });

  it('oculta las duplicadas salvo que se pidan, y las descartadas salvo que se pida verlas', () => {
    const duplicada = porId('nomolesten:hotel-boutique-con-piscina-en-sitges');
    assert.ok(duplicada.etiquetas.includes('duplicada'));
    assert.ok(!buscar({}).includes(duplicada), 'las repetidas no se ven por defecto');
    assert.ok(buscar({ dup: '1' }).includes(duplicada));
    const descartadas = new Set([buscar({})[0].id]);
    assert.equal(buscar({}, { descartadas }).length, buscar({}).length - 1, 'la ✕ la quita de todas las listas sin tocar nada más');
    assert.equal(buscar({ sindesc: '0' }, { descartadas }).length, buscar({}).length, 'con «sindesc=0» se vuelven a ver');
  });

  it('busca con varias palabras y quita las que llevan «-» delante', () => {
    assert.deepEqual(analizarConsulta('  Playa  -Crucero '), { incluye: ['playa'], excluye: ['crucero'] });
    const conSpa = nombres(buscar({ q: 'spa' }));
    assert.ok(conSpa.includes('Vielha') && conSpa.includes('Peñíscola'));
    const sinAran = nombres(buscar({ q: 'spa -aran' }));
    assert.ok(!sinAran.includes('Vielha') && sinAran.includes('Peñíscola'));
  });

  it('finde concreto, puente por su id y rango de fechas', () => {
    const sitges = porId('chollometro:hotel-en-sitges-para-el-festival-de-cine'); // 16–18 de octubre
    assert.ok(buscar({ cuando: '2026-10-16' }).includes(sitges));
    assert.ok(!buscar({ cuando: finde.id }).includes(sitges));
    assert.ok(buscar({ desde: '2026-10-15', hasta: '2026-10-20' }).includes(sitges));
    assert.ok(!buscar({ desde: '2026-10-19' }).includes(sitges));
    assert.ok(buscar({ cuando: puente.id }).includes(porId('viajerospiratas:delta-del-ebro-en-el-puente-de-la-merce-')));
  });

  it('ordena por precio por noche, por ahorro y por valoración, con los huecos al final', () => {
    const porNoche = buscar({ orden: 'noche' }).map((o) => o.precioNoche ?? Infinity);
    assert.deepEqual(porNoche, [...porNoche].sort((a, b) => a - b));
    const ahorros = buscar({ orden: 'ahorro' }).map((o) => o.referencia?.ahorroPct ?? -1);
    assert.deepEqual(ahorros, [...ahorros].sort((a, b) => b - a));
    const notas = buscar({ orden: 'valoracion' }).map((o) => o.valoracion?.nota ?? -1);
    assert.deepEqual(notas, [...notas].sort((a, b) => b - a));
  });
});

describe('actividades', () => {
  const actividades = ofertas.filter(esActividad);
  const buscarAct = (params) => buscarActividades(ofertas, leerFiltrosActividades(params), ctxBusqueda);
  const ctxFicha = {
    temas, fuentes: new Map(datos.fuentes.map((f) => [f.id, f.nombre])), favoritos: new Set(), historial,
    viajeros: datos.viajeros, distancias: medirDistancias(ofertas, null, origen), desde: origen.nombre,
  };
  const escapadaGirona = ofertas.find((o) => o.lugar?.nombre === 'Girona' && !esActividad(o) && o.tipo !== 'vuelo');

  it('el ejemplo trae actividades de Civitatis y GuruWalk, con precio por persona y algunas gratis', () => {
    assert.equal(actividades.length, 10);
    assert.deepEqual([...new Set(actividades.map((o) => o.fuente))].sort(), ['civitatis', 'guruwalk']);
    assert.equal(actividades.filter((o) => o.precio === 0).length, 4);
    assert.ok(actividades.every((o) => o.unidad === 'pp' && o.valoracion.nota > 0 && o.noches === null));
  });

  it('la duración sale de la etiqueta «duracion:<minutos>»', () => {
    assert.equal(duracionActividad(porId('guruwalk:free-tour-barrio-gotico-barcelona')), 150);
    assert.equal(duracionActividad({ etiquetas: ['temperatura:356'] }), null);
    assert.equal(duracionActividad({ etiquetas: ['duracion:0'] }), null);
    assert.equal(duracionActividad({}), null);
  });

  it('filtra por texto, lugar o destino, precio máximo, «solo gratis», valoración y temática', () => {
    assert.equal(buscarAct({}).length, actividades.length);
    assert.ok(buscarAct({}).every(esActividad), 'solo actividades, ni escapadas ni vuelos');
    const gratis = buscarAct({ gratis: '1' });
    assert.ok(gratis.length === 4 && gratis.every((o) => o.precio === 0));
    assert.ok(buscarAct({ max: '20' }).every((o) => o.precio <= 20));
    assert.equal(buscarAct({ gratis: '1', max: '5' }).length, 4, 'las gratis caben en cualquier precio máximo');
    const girona = buscarAct({ dest: 'Girona' });
    assert.ok(girona.length >= 2 && girona.every((o) => o.lugar.nombre === 'Girona' || o.lugar.region === 'Girona'));
    assert.ok(buscarAct({ nota: '9.2' }).every((o) => o.valoracion.nota >= 9.2));
    assert.ok(buscarAct({ temas: 'gastronomia' }).every((o) => o.temas.includes('gastronomia')));
    const conTexto = buscarAct({ q: 'free tour girona' });
    assert.ok(conTexto.length > 0 && conTexto.every((o) => o.precio === 0));
    assert.ok(conTexto.some((o) => o.id === 'guruwalk:free-tour-girona-judia'));
    assert.deepEqual(buscarAct({ q: 'free tour -besalu' }).filter((o) => o.lugar.nombre === 'Besalú'), []);
  });

  it('ordena por puntuación (por defecto), por precio y por valoración', () => {
    const precios = buscarAct({ orden: 'precio' }).map((o) => o.precio);
    assert.deepEqual(precios, [...precios].sort((a, b) => a - b));
    const notas = buscarAct({ orden: 'valoracion' }).map((o) => o.valoracion.nota);
    assert.deepEqual(notas, [...notas].sort((a, b) => b - a));
    const puntos = buscarAct({ orden: 'inventado' }).map((o) => o.puntuacion);
    assert.deepEqual(puntos, [...puntos].sort((a, b) => b - a));
  });

  it('no se mezclan con las escapadas, pero la búsqueda global sí las encuentra', () => {
    assert.ok(actividades.length > 0 && !buscar({}).some(esActividad));
    assert.ok(!resumenPuentes(ofertas, datos.puentes, HOY)[0].escapadas.some(esActividad));
    assert.ok(buscarTexto(ofertas, leerFiltrosComunes({ q: 'free tour' }), ctxBusqueda).some(esActividad));
  });

  it('propone las mejores para este finde y las del mismo lugar que una escapada', () => {
    const delFinde = actividadesPara(ofertas, periodoFinde(finde), { max: 4 });
    assert.equal(delFinde.length, 4);
    assert.ok(delFinde.every(esActividad));
    assert.ok(delFinde.every((o, i) => i === 0 || delFinde[i - 1].puntuacion >= o.puntuacion));
    assert.equal(actividadesPara(ofertas, periodoFinde(finde), { max: 4, descartadas: new Set([delFinde[0].id]) })[0].id,
      delFinde[1].id, 'las descartadas no se proponen');

    const cerca = actividadesCerca(ofertas, escapadaGirona);
    assert.ok(cerca.length >= 2 && cerca.length <= 3);
    assert.ok(cerca.every((o) => esActividad(o) && o.lugar.nombre === 'Girona'));
    assert.deepEqual(actividadesCerca(ofertas, actividades[0]), [], 'una actividad no se recomienda a sí misma');
    const vueloOporto = ofertas.find((o) => o.lugar?.iata === 'OPO');
    const conOtroNombre = { ...vueloOporto, lugar: { ...vueloOporto.lugar, nombre: 'Porto' } };
    assert.equal(actividadesCerca(ofertas, conOtroNombre).length, 1, 'vale con estar a menos de 25 km');
    assert.deepEqual(actividadesCerca(ofertas, { ...vueloOporto, lugar: null }), []);
  });

  it('la vista de actividades trae sus filtros, la duración y el precio «Gratis»', () => {
    const html = vistaActividades(estadoPanel(), { gratis: '1' });
    for (const campo of ['q', 'temas', 'dest', 'max', 'nota', 'orden', 'gratis']) {
      assert.match(html, new RegExp(`name="${campo}"`), `falta el filtro ${campo}`);
    }
    assert.match(html, /4 planes · 4 gratis/);
    assert.match(html, /<strong class="precio__gratis">Gratis<\/strong> <span class="precio__unidad">propina voluntaria/);
    assert.match(html, /<li><svg[^]*?<\/svg><span>2 h 30 min<\/span><\/li>/);
    assert.match(html, /Ver en GuruWalk/);
    assert.match(vistaActividades(estadoPanel(), { temas: 'gastronomia', nota: '9.9' }), /Ninguna actividad cumple estos filtros/);
  });

  it('la portada las propone y la ficha enseña qué hacer allí', () => {
    const portada = vistaFinde(estadoPanel(), {});
    assert.match(portada, /Planes para este finde/);
    assert.match(portada, /href="#\/actividades"/);
    // «De un vistazo»: cifras que llevan a la misma búsqueda que cuentan.
    const vistazo = portada.match(/<ul class="vistazo"[^]*?<\/ul>/)?.[0] ?? '';
    const escapadasFinde = vistazo.match(/<strong>(\d+)<\/strong> escapadas? este finde/)?.[1];
    assert.ok(escapadasFinde, 'dice cuántas escapadas hay este finde');
    assert.match(vistazo, /href="#\/escapadas\?cuando=finde&amp;orden=noche"|href="#\/escapadas\?cuando=finde&orden=noche"/);
    assert.match(vistazo, /desde \d+\s€ por persona y noche/);

    const conActividades = contenidoFicha(escapadaGirona, { ...ctxFicha, actividades: actividadesCerca(ofertas, escapadaGirona) });
    assert.match(conActividades, /Qué hacer allí/);
    assert.match(conActividades, /Free tour por la Girona jud/);
    assert.match(conActividades, /class="fila__precio">Gratis</);
    assert.ok(!/Qué hacer allí/.test(contenidoFicha(escapadaGirona, ctxFicha)), 'sin actividades no aparece la sección');
  });

  it('los cruceros se ocultan en las escapadas salvo que se apague el interruptor', () => {
    const base = porId('chollometro:hotel-en-sitges-para-el-festival-de-cine');
    const crucero = { ...base, id: 'prueba:crucero', tipo: 'crucero', titulo: 'Crucero de 4 noches por el Mediterráneo', etiquetas: [] };
    const conCrucero = [...ofertas, crucero];
    const ver = (params) => buscarEscapadas(conCrucero, leerFiltrosEscapadas(params), ctxBusqueda).ofertas;
    assert.equal(leerFiltrosEscapadas({}).sinCruceros, true, 'activado por defecto');
    assert.ok(!ver({}).some((o) => o.id === crucero.id));
    assert.ok(ver({ cru: '0' }).some((o) => o.id === crucero.id));
    assert.match(vistaEscapadas(estadoPanel(), {}), /name="cru" value="1" data-defecto checked>\s*Ocultar cruceros/);
    assert.match(vistaEscapadas(estadoPanel({ ...datos, ofertas: conCrucero }), {}), /<option value="crucero">Crucero/);
  });
});

describe('ayudas para elegir', () => {
  it('«Sorpréndeme» propone tres planes variados a menos de 3 h y cambia con cada ronda', () => {
    const { ofertas: lista, distancias } = buscarEscapadas(ofertas, leerFiltrosEscapadas({}), ctxBusqueda);
    const planes = planesSorpresa(lista, { distancias });
    assert.equal(planes.length, 3);
    assert.ok(planes.every((o) => distancias.get(o.id).minutos <= 180));
    assert.equal(new Set(planes.map((o) => o.temas[0])).size, 3, 'cada plan de una temática');
    const otros = planesSorpresa(lista, { distancias }, { salto: 3 });
    assert.notDeepEqual(otros.map((o) => o.id), planes.map((o) => o.id));
  });

  it('«Recomendado para ti» ordena por afinidad con los favoritos y lo explica', () => {
    const favorito = ofertas.find((o) => o.temas.includes('spa') && o.tipo !== 'vuelo');
    const favoritos = new Set([favorito.id]);
    const perfil = perfilFavoritos(ofertas, favoritos);
    assert.equal(perfil.total, 1);
    assert.deepEqual(perfil.temas, [...favorito.temas].sort().map((valor) => ({ valor, n: 1 })));
    assert.equal(perfil.zonas[0].valor, favorito.lugar.region);

    const distancias = medirDistancias(ofertas, null, origen);
    const lista = recomendadas(ofertas, perfil, { ...ctxBusqueda, favoritos, distancias }, { max: 4 });
    assert.ok(lista.length > 0 && lista.length <= 4);
    assert.ok(!lista.some((r) => r.oferta.id === favorito.id), 'no recomienda lo que ya tienes');
    assert.ok(lista.every((r) => r.motivos.some((m) => /^te gustan los planes de|^sueles guardar escapadas por/.test(m))));
    assert.ok(lista.every((r) => r.oferta.temas.some((t) => favorito.temas.includes(t)) || r.oferta.lugar?.region === favorito.lugar.region));
    assert.deepEqual(lista.map((r) => r.puntos), [...lista.map((r) => r.puntos)].sort((a, b) => b - a));
    assert.deepEqual(recomendadas(ofertas, perfilFavoritos(ofertas, new Set()), ctxBusqueda), []);
  });

  it('los puentes traen sus días libres, el día que hay que pedir y sus ofertas', () => {
    const [merce, pilar] = resumenPuentes(ofertas, datos.puentes, HOY);
    assert.deepEqual(merce.dias, ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    assert.deepEqual(merce.pedir, ['2026-09-25'], 'el viernes entre el festivo y el finde');
    assert.deepEqual(pilar.pedir, [], 'el Pilar cae en lunes: no hay que pedir nada');
    assert.ok(merce.escapadas.length > 0 && merce.escapadas.every((o) => o.tipo !== 'vuelo'));
    assert.equal(merce.escapadas[0].fechas.puenteId, merce.puente.id, 'primero las que son del puente');
    assert.ok(merce.vuelos.every((o) => o.fechas.puenteId === merce.puente.id));
    assert.equal(resumenPuentes(ofertas, datos.puentes, '2026-10-01').length, 1, 'los puentes pasados no salen');
    assert.deepEqual(diasAPedir({ desde: '2026-12-05', hasta: '2026-12-08', festivos: [{ fecha: '2026-12-08' }] }), ['2026-12-07']);
  });

  it('copia los filtros actuales como criterio de config/vigilados.json', () => {
    const f = leerFiltrosEscapadas({
      q: 'spa -crucero', temas: 'spa,rural', max: '90', h: '2', tipo: 'hotel', cuando: 'puente',
      lugar: 'Girona', lat: '41.9794', lon: '2.8214',
    });
    assert.deepEqual(criterioVigilado('Spa cerca de Girona', f, { vista: 'escapadas' }), {
      nombre: 'Spa cerca de Girona',
      // Tal cual (con «-crucero»): el aviso busca igual que el panel.
      texto: 'spa -crucero',
      tipo: 'hotel',
      temas: ['spa', 'rural'],
      precioMax: 90,
      // Desde Girona, un radio de ~2 h alrededor de Girona; no «2 h desde Barcelona» (el origen del escaneo).
      cerca: { lat: 41.9794, lon: 2.8214, radioKm: 123 },
      puente: true,
      sinCruceros: true,
    });
    assert.deepEqual(criterioVigilado('', leerFiltrosVuelos({ aero: 'BCN', max: '60' }), { vista: 'vuelos' }),
      { nombre: 'Mi búsqueda', tipo: 'vuelo', aeropuerto: 'BCN', precioMax: 60 });
  });
});

describe('búsqueda, novedades y resúmenes', () => {
  it('busca sin tildes ni mayúsculas en título, lugar y destino', () => {
    const lista = buscarTexto(ofertas, leerFiltrosComunes({ q: 'BESALU' }), ctxBusqueda);
    assert.ok(lista.some((o) => o.lugar?.nombre === 'Besalú'));
    assert.ok(buscarTexto(ofertas, leerFiltrosComunes({ q: 'opo' }), ctxBusqueda).some((o) => o.vuelo?.destino === 'OPO'));
    assert.ok(buscarTexto(ofertas, leerFiltrosComunes({ q: 'hotel -sitges' }), ctxBusqueda).every((o) => o.lugar?.nombre !== 'Sitges'));
  });

  it('da igual que sobren o falten espacios', () => {
    const lloret = (q) => buscarTexto(ofertas, leerFiltrosComunes({ q }), ctxBusqueda).some((o) => o.lugar?.nombre === 'Lloret de Mar');
    for (const q of ['lloret de mar', 'lloretdemar', '  lloret   de  mar ', 'LLORET DE MAR']) assert.ok(lloret(q), q);
    assert.ok(coincideTexto({ titulo: 'Hotel en Barcelona' }, 'barce lona'));
    assert.ok(coincideTexto({ titulo: "Casa rural en L'Escala" }, 'lescala'));
    assert.ok(coincideTexto({ titulo: 'Sant Cugat del Vallès' }, 'santcugat'));
    // Sin espacios solo se juntan palabras a partir de 5 letras: «del» no es cualquier «de l…».
    assert.ok(!coincideTexto({ titulo: 'Casa de la Vall' }, 'del'));
  });

  it('con alguna falta, solo si no hay nada exacto y sin tocar lo que ya se encontraba', () => {
    assert.equal(distanciaPalabras('girnoa', 'girona'), 1);
    assert.equal(distanciaPalabras('barclona', 'barcelona'), 1);
    assert.ok(!coincideTexto({ titulo: 'Hotel en Barcelona' }, 'barclona'), 'sin «aproximado», exacto (los avisos por email)');
    assert.ok(coincideTexto({ titulo: 'Hotel en Barcelona' }, 'barclona', { aproximado: true }));
    assert.ok(!coincideTexto({ titulo: 'Monasterio de Santes Creus' }, 'reus', { aproximado: true }), 'palabras cortas, sin faltas');
    const busca = (q) => conFaltas((g) => buscarTexto(ofertas, g, ctxBusqueda), leerFiltrosComunes({ q }));
    const exacta = busca('girona');
    assert.equal(exacta.aproximado, false);
    const conFalta = busca('girnoa');
    assert.equal(conFalta.aproximado, true);
    assert.deepEqual(ids(conFalta.resultado), ids(exacta.resultado));
    assert.ok(busca('sitjes').resultado.some((o) => o.lugar?.nombre === 'Sitges'));
    assert.deepEqual(busca('xyzzy'), { resultado: [], aproximado: false });
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
    assert.deepEqual(resumenFuentes(datos.fuentes), { activas: 9, ok: 8, conError: 1, conAviso: 0, inactivas: 2 });
    const html = vistaFuentes(estadoPanel());
    assert.match(html, /Bloqueada<\/span><\/td>\s*<td data-etiqueta="Detalle">Su robots\.txt prohíbe \/api/);
    assert.match(html, /HTTP 403 en www\.nomolesten\.com/);
  });

  it('describe los vigilados y enlaza a la edición en GitHub', () => {
    const [, , spa, puentes] = leer('vigilados.json').vigilados;
    assert.deepEqual(describirCriterio(spa, { temas: datos.temas, origen }), ['Relax y spa', `hasta ${euros(70)} publicados`, 'a menos de 2 h en coche']);
    assert.ok(describirCriterio(puentes, { temas: datos.temas, origen }).includes('a menos de 300 km de Barcelona'));
    assert.equal(urlEditarVigilados({ hostname: 'jordi.github.io', pathname: '/escapadas-finde/' }),
      'https://github.com/jordi/escapadas-finde/edit/main/config/vigilados.json');
    assert.equal(urlEditarVigilados({ hostname: 'localhost', pathname: '/' }), null);
  });
});

describe('fechas, formato, geocodificación y plantillas', () => {
  const ctxTarjeta = {
    temas, fuentes: new Map(datos.fuentes.map((f) => [f.id, f.nombre])), favoritos: new Set(), historial,
    viajeros: datos.viajeros, distancias: medirDistancias(ofertas, null, origen), desde: origen.nombre,
  };

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
    const maliciosa = { ...porId('chollometro:hotel-en-sitges-para-el-festival-de-cine'), titulo: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' };
    const html = tarjeta(maliciosa, ctxTarjeta);
    assert.ok(!html.includes('<img src=x') && html.includes('&lt;img src=x'));
    assert.ok(!html.includes('javascript:'));
    const vuelo = ofertas.find((o) => o.vuelo && historial[o.id]?.length >= 2);
    assert.match(tarjeta(vuelo, ctxTarjeta), /class="billete"[^]*<svg class="minigrafica"/);
    assert.match(tarjeta(ofertas.find((o) => o.tipo === 'vuelo' && !o.vuelo), ctxTarjeta), /class="tarjeta"/);
  });

  it('la tarjeta enseña ahorro, valoración, coste del coche, eventos, tiempo y el botón de descartar', () => {
    const casaBesalu = porId('chollometro:besalu-casa-rural-para-6-personas-por-18');
    const besalu = tarjeta(casaBesalu, ctxTarjeta);
    assert.match(besalu, /Un 35 % por debajo de lo normal/);
    assert.match(besalu, /Casa rural<\/span><\/li>/);
    assert.match(besalu, /class="tarjeta__opiniones"[^>]*>[^]*?<strong>8<\/strong><span class="tarjeta__opiniones-texto">Muy bien/, 'las opiniones, a la vista');
    assert.match(besalu, /≈ \d+\s€ de gasolina ida y vuelta · estimado, un coche para 2 personas/);
    // Fechas flexibles: los eventos son los del próximo finde, así que van a la ficha y avisando.
    assert.ok(!besalu.includes('Mercat medieval de Besalú'));
    assert.match(contenidoFicha(casaBesalu, ctxTarjeta), /si vas entonces[^]*Mercat medieval de Besalú/);
    assert.match(besalu, /por persona y noche/);
    assert.match(besalu, /data-descartar="chollometro:besalu/);

    const sitges = tarjeta(porId('chollometro:hotel-en-sitges-para-el-festival-de-cine'), ctxTarjeta);
    assert.match(sitges, /También en <a[^>]*>No Molesten<\/a>/);
    assert.ok(!/Lluvia ligera/.test(sitges), 'el tiempo va en la ficha');
    assert.match(contenidoFicha(porId('chollometro:hotel-en-sitges-para-el-festival-de-cine'), ctxTarjeta), /Lluvia ligera · 23° · 65 % de lluvia/);
    assert.match(sitges, /sello--chollazo[^>]*>[^]*?Chollazo</);
  });

  it('lo que no está no se enseña', () => {
    const pelada = {
      ...porId('chollometro:besalu-casa-rural-para-6-personas-por-18'),
      referencia: null, equivalentes: [], costeCoche: null, tiempo: null, eventos: [],
      valoracion: null, precioNoche: null, alojamiento: null,
    };
    const html = tarjeta(pelada, ctxTarjeta);
    assert.ok(!/por debajo de lo normal|También en|de gasolina ida y vuelta|class="eventos"|class="valoracion"|por persona y noche/.test(html));
    assert.ok(!/class="comparador"/.test(contenidoFicha(pelada, ctxTarjeta)), 'sin otras webs ni nombre propio: sin «Comparar precios»');
  });
});

describe('comparar precios del mismo alojamiento', () => {
  const base = porId('chollometro:besalu-casa-rural-para-6-personas-por-18');
  const fuentes = new Map([['tuscasasrurales', 'Tus Casas Rurales'], ['escapadarural', 'Escapada Rural'], ['clubrural', 'Clubrural']]);
  const ctx = { temas, fuentes, favoritos: new Set(), historial: {}, viajeros: 2, noches: 2, distancias: new Map(), desde: origen.nombre };
  const casa = (campos) => ({
    ...base, tipo: 'hotel', fuente: 'tuscasasrurales', id: 'tuscasasrurales:1', titulo: 'Cal Saragossa', precio: 27, unidad: 'pp/noche',
    precioNoche: 27, noches: null, url: 'https://www.tuscasasrurales.com/cal-saragossa', urlReserva: null, afiliado: null, patrocinada: null,
    enlaces: [], equivalentes: [], establecimiento: 'Cal Saragossa', ...campos,
  });
  const otra = { id: 'escapadarural:2', fuente: 'escapadarural', precio: 40, unidad: 'pp/noche', precioNoche: 40, url: 'https://www.escapadarural.com/casa-rural/lleida/cal-saragossa' };

  it('la tarjeta dice si es la más barata, si hay otra web más barata o si cuesta lo mismo', () => {
    assert.match(tarjeta(casa({ equivalentes: [otra] }), ctx),
      /La más barata de 2 webs<\/strong>: en <a href="https:\/\/www\.escapadarural\.com[^"]*" target="_blank" rel="noopener noreferrer">Escapada Rural<\/a>, 40\s€ \(13\s€ más\)/);
    const cara = casa({ fuente: 'escapadarural', id: 'escapadarural:2', precio: 40, precioNoche: 40, equivalentes: [{ ...otra, id: 'tuscasasrurales:1', fuente: 'tuscasasrurales', precio: 27, precioNoche: 27 }] });
    assert.match(tarjeta(cara, ctx), /Más barata en <a[^>]*>Tus Casas Rurales<\/a><\/strong>: 27\s€ por persona y noche \(13\s€ menos\)/);
    assert.match(tarjeta(casa({ equivalentes: [{ ...otra, precio: 27.4, precioNoche: 27.4 }] }), ctx), /Mismo precio en <a[^>]*>Escapada Rural<\/a>/);
    // Si una no tiene precio por persona y noche no se compara: solo «También en».
    assert.match(tarjeta(casa({ equivalentes: [{ ...otra, unidad: 'total', precioNoche: null }] }), ctx), /También en <a[^>]*>Escapada Rural<\/a> por 40\s€/);
  });

  it('la ficha ordena las webs, marca la más barata y calcula el ahorro del viaje', () => {
    const cara = casa({ fuente: 'escapadarural', id: 'escapadarural:2', precio: 40, precioNoche: 40, url: otra.url,
      equivalentes: [{ ...otra, id: 'tuscasasrurales:1', fuente: 'tuscasasrurales', precio: 27, precioNoche: 27, url: 'https://www.tuscasasrurales.com/cal-saragossa' }] });
    // Con `porId`, el enlace de la otra web es el de reserva (con su afiliado, si lo hay).
    const porIdFicha = new Map([['tuscasasrurales:1', { urlReserva: 'https://www.tuscasasrurales.com/cal-saragossa?aff=1', afiliado: 'tcr' }]]);
    const html = contenidoFicha(cara, { ...ctx, porId: porIdFicha });
    const comparador = html.slice(html.indexOf('class="comparador"'), html.indexOf('</section>', html.indexOf('class="comparador"')));
    assert.match(comparador, /El mismo alojamiento en 2 webs, por persona y noche/);
    const filas = [...comparador.matchAll(/<tr class="([^"]*)">\s*<th scope="row">([^<]*)/g)].map((m) => [m[2].trim(), m[1]]);
    assert.deepEqual(filas, [['Tus Casas Rurales', 'comparador__fila--mejor'], ['Escapada Rural', 'comparador__fila--actual']]);
    assert.match(comparador, /Más barata<\/span>/);
    assert.match(comparador, /40\s€<\/strong> <span class="comparador__dif">\+13\s€<\/span>/);
    assert.match(comparador, /href="https:\/\/www\.tuscasasrurales\.com\/cal-saragossa\?aff=1" target="_blank" rel="sponsored noopener noreferrer"[^>]*>Ver <span class="suave">\(afiliado\)<\/span>/);
    assert.match(comparador, /En <strong>Tus Casas Rurales<\/strong> ahorras ≈ 13\s€ por persona y noche \(≈ 52\s€ para 2 personas y 2 noches\)/);
    assert.match(html, /Los enlaces marcados «\(afiliado\)» son de afiliado/, 'el aviso de afiliado también cuenta el comparador');

    const barata = contenidoFicha(casa({ equivalentes: [otra] }), ctx);
    assert.match(barata, /Aquí es la más barata: en Escapada Rural cuesta ≈ 13\s€ más por persona y noche/);

    // Empatada con otra web y una tercera más cara: la diferencia es con la más cara, no «0 € más».
    const empate = casa({ equivalentes: [{ ...otra, fuente: 'clubrural', id: 'clubrural:3', precio: 27, precioNoche: 27 }, otra] });
    const html3 = contenidoFicha(empate, ctx);
    assert.match(html3, /Aquí es la más barata \(igual que en Clubrural\): en Escapada Rural cuesta ≈ 13\s€ más/);
    assert.equal((html3.match(/class="comparador__mejor"/g) ?? []).length, 2, 'las dos más baratas');
    assert.match(tarjeta(empate, ctx), /La más barata de 3 webs<\/strong>, igual que en <a[^>]*>Clubrural<\/a>/);
  });

  it('los enlaces para buscar este alojamiento van en «Comparar precios», no entre los demás', () => {
    const enlaces = [
      { etiqueta: 'Hoteles en Booking', url: 'https://www.booking.com/searchresults.es.html?ss=Guixers', grupo: 'alojamiento' },
      { etiqueta: 'Este alojamiento en Booking', url: 'https://www.booking.com/searchresults.es.html?ss=Cal%20Saragossa%2C%20Guixers', grupo: 'este-alojamiento' },
      { etiqueta: 'Su web y opiniones en Google', url: 'https://www.google.com/search?q=Cal%20Saragossa', grupo: 'este-alojamiento' },
    ];
    const html = contenidoFicha(casa({ enlaces }), ctx);
    const comparador = html.slice(html.indexOf('class="comparador"'), html.indexOf('class="ficha__mas-enlaces"'));
    assert.match(comparador, /Solo lo hemos visto en Tus Casas Rurales\. Compara su precio en:/);
    assert.match(comparador, />Este alojamiento en Booking/);
    assert.match(comparador, />Su web y opiniones en Google/);
    const resto = html.slice(html.indexOf('class="ficha__mas-enlaces"'));
    assert.match(resto, /Organiza el viaje/);
    assert.match(resto, />Hoteles en Booking/);
    assert.ok(!resto.includes('Este alojamiento en Booking'));
    assert.ok(html.indexOf('>Ver la oferta') < html.indexOf('class="comparador"'), 'primero el botón de la oferta');
  });
});

describe('vistas nuevas', () => {
  it('la portada propone planes sorpresa y recomendados según los favoritos', () => {
    const e = estadoPanel();
    e.favoritos = new Set([ofertas.find((o) => o.temas.includes('spa') && o.tipo !== 'vuelo').id]);
    const html = vistaFinde(e, {});
    assert.match(html, /Sorpréndeme<\/span><\/h2>/);
    assert.match(html, /data-sorpresa/);
    assert.match(html, /Recomendado para ti/);
    assert.match(html, /class="motivo">[^]*?Porque te gustan los planes de/);
    assert.equal((contenidoSorpresa(e, {}).match(/class="tarjeta"/g) ?? []).length, 3);
  });

  it('la vista de puentes dice qué día hay que pedir', () => {
    const html = vistaPuentes(estadoPanel());
    assert.match(html, /La Mercè/);
    assert.match(html, /Pide el día vie 25 sep y tendrás el puente entero/);
    assert.match(html, /No hay que pedir ningún día/);
    assert.match(html, /dia--festivo/);
    assert.match(html, /href="#\/escapadas\?cuando=puente-2026-09-24"/);
  });

  it('el formulario de escapadas trae los filtros nuevos y las búsquedas guardadas', () => {
    const e = estadoPanel();
    e.busquedas = [{ nombre: 'Spa barato', vista: 'escapadas', hash: '#/escapadas?temas=spa&pnMax=40' }];
    const html = vistaEscapadas(e, { aloj: 'casa-rural', nodest: 'Sitges' });
    for (const campo of ['q', 'pnMin', 'precio', 'preciotipo', 'como', 'dto', 'pts', 'nota', 'aloj', 'region', 'clasica', 'desde', 'cho', 'sindesc', 'dup', 'cru']) {
      assert.match(html, new RegExp(`name="${campo}"`), `falta el filtro ${campo}`);
    }
    assert.match(html, /<option value="casa-rural" selected/);
    assert.match(html, /name="nodest" value="Sitges" checked> <svg[^]*?<\/svg>Sitges/);
    // «Copiar para los avisos por email» (config/vigilados.json) es solo para quien administra la web.
    assert.doesNotMatch(html, /data-copiar-vigilado|config\/vigilados\.json/);
    assert.match(vistaEscapadas({ ...e, propietario: true }, { aloj: 'casa-rural' }), /data-copiar-vigilado="escapadas"/);
    assert.match(html, /data-guardar-busqueda="escapadas"/);
    assert.match(html, /Spa barato/);
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

describe('ofertas que ya no están', () => {
  const hora = (h) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();
  const ctx = { revision: AHORA, intervalos: new Map([['lenta', 720]]) };

  it('«sin comprobar»: más de 24 h (o 3 revisiones de su web) sin verla, medido hasta la hora del escaneo', () => {
    assert.equal(sinComprobar({ fuente: 'rapida', vistaUltima: hora(23) }, ctx), false);
    assert.equal(sinComprobar({ fuente: 'rapida', vistaUltima: hora(25) }, ctx), true);
    assert.equal(sinComprobar({ fuente: 'lenta', vistaUltima: hora(30) }, ctx), false, 'cada 12 h: hasta 36 h');
    assert.equal(sinComprobar({ fuente: 'lenta', vistaUltima: hora(37) }, ctx), true);
    // Si el escaneo se retrasa, no pasan todas a «sin comprobar» de golpe.
    assert.equal(sinComprobar({ fuente: 'rapida', vistaUltima: hora(2) }, { revision: new Date(AHORA.getTime() - 3_600_000), ahora: new Date(AHORA.getTime() + 48 * 3_600_000) }), false);
  });

  it('van al final sin cambiar el orden entre ellas, y con «frescas=1» no salen', () => {
    const [a, b, c] = [{ id: 'a', fuente: 'x', vistaUltima: hora(40) }, { id: 'b', fuente: 'x', vistaUltima: hora(1) }, { id: 'c', fuente: 'x', vistaUltima: hora(2) }];
    assert.deepEqual(alFinalSinComprobar([a, b, c], ctx).map((o) => o.id), ['b', 'c', 'a']);

    const e = estadoPanel();
    const base = contextoBusqueda(e);
    const todas = buscarEscapadas(ofertas, leerFiltrosEscapadas({}), base).ofertas;
    const i = todas.findIndex((o) => sinComprobar(o, base));
    if (i >= 0) assert.ok(todas.slice(i).every((o) => sinComprobar(o, base)), 'las sin comprobar, todas detrás');
    const frescas = buscarEscapadas(ofertas, leerFiltrosEscapadas({ frescas: '1' }), base).ofertas;
    assert.ok(frescas.every((o) => !sinComprobar(o, base)));
    assert.deepEqual(filtrosActivos('escapadas', { frescas: '1' }).map((c) => c.texto), ['Solo comprobadas hace poco']);
  });

  it('las marcadas «Ya no está disponible» se ocultan como las descartadas', () => {
    const e = estadoPanel();
    const [una, otra] = buscarEscapadas(ofertas, leerFiltrosEscapadas({}), contextoBusqueda(e)).ofertas;
    e.descartadas = new Set([una.id]);
    e.misEstados = new Map([[otra.id, 'no-disponible']]);
    assert.deepEqual([...ocultas(e)].sort(), [una.id, otra.id].sort());
    const ids = buscarEscapadas(ofertas, leerFiltrosEscapadas({}), contextoBusqueda(e)).ofertas.map((o) => o.id);
    assert.ok(!ids.includes(una.id) && !ids.includes(otra.id));
    const conTodas = buscarEscapadas(ofertas, leerFiltrosEscapadas({ sindesc: '0' }), contextoBusqueda(e)).ofertas.map((o) => o.id);
    assert.ok(conTodas.includes(otra.id));
    e.misEstados = new Map([[otra.id, 'reservada']]);
    assert.deepEqual([...ocultas(e)], [una.id], 'la reservada sigue saliendo');
  });
});

describe('menú de cuatro apartados', () => {
  it('Explorar, Fechas y Mis cosas llevan sus pestañas, con la actual marcada', () => {
    const e = estadoPanel();
    const explorar = vistaEscapadas(e, {});
    assert.match(explorar, /<nav class="pestanas" aria-label="Explorar">/);
    assert.match(explorar, /href="#\/escapadas" data-vista="escapadas" aria-current="page"/);
    assert.match(explorar, /href="#\/actividades" data-vista="actividades"><svg[^]*?<span>Planes<\/span>/);
    assert.match(vistaActividades(e, {}), /<h1 class="titulo-vista" tabindex="-1">Planes<\/h1>/);
    assert.match(vistaCalendario(e), /<nav class="pestanas" aria-label="Fechas">[^]*data-vista="calendario" aria-current="page"/);
    assert.match(vistaPuentes(e), /data-vista="puentes" aria-current="page"/);
    assert.match(vistaMis(e), /<nav class="pestanas" aria-label="Mis cosas">[^]*data-vista="mis" aria-current="page"/);
  });

  it('el buscador de la cabecera lleva a cada pestaña de Explorar con la búsqueda puesta', () => {
    const html = resultadosBuscar(estadoPanel(), { q: 'girona' });
    assert.match(html, /href="#\/escapadas\?q=girona"[^>]*>[^]*?En Escapadas <span class="suave">\(\d+\)/);
    assert.ok(!/nuevas=1/.test(resultadosBuscar(estadoPanel(), { nuevas: '1' }).match(/buscar__pestanas/) ?? ''));
  });

  it('sin nada exacto, el buscador y Explorar enseñan lo más parecido y lo dicen', () => {
    const aviso = /Nada coincide exactamente con «girnoa»/;
    assert.match(resultadosBuscar(estadoPanel(), { q: 'girnoa' }), aviso);
    assert.match(resultadosEscapadas(estadoPanel(), { q: 'girnoa' }), aviso);
    assert.doesNotMatch(resultadosBuscar(estadoPanel(), { q: 'girona' }), /Nada coincide exactamente/);
    assert.match(resultadosBuscar(estadoPanel(), { q: 'xyzzy' }), /Nada coincide con «xyzzy»/);
  });
});

describe('mis cosas: búsquedas guardadas que avisan', () => {
  it('cada búsqueda dice cuántas ofertas la cumplen y cuántas son nuevas desde que se miró', () => {
    const e = estadoPanel();
    const todas = resultadosDeBusqueda(e, { hash: '#/escapadas?temas=rural' });
    assert.ok(todas.length > 0);
    const corte = '2026-09-10T00:00:00Z';
    e.busquedas = [
      { nombre: 'Rural', vista: 'escapadas', hash: '#/escapadas?temas=rural', visto: corte },
      { nombre: 'Sin mirar', vista: 'buscar', hash: '#/buscar?q=spa', visto: null },
    ];
    const [rural, sinMirar] = avisosDeBusquedas(e);
    assert.equal(rural.lista.length, todas.length);
    assert.deepEqual(rural.nuevas.map((o) => o.id), todas.filter((o) => Date.parse(o.vistaPrimera) > Date.parse(corte)).map((o) => o.id));
    assert.deepEqual(sinMirar.nuevas, [], 'sin fecha de la última vez no hay «nuevas»');
    assert.equal(totalNovedadesGuardadas(e), rural.nuevas.length);
    const html = vistaMis(e);
    assert.match(html, /<h3>Rural<\/h3>/);
    assert.match(html, /data-abrir-busqueda="Rural"/);
    assert.match(html, /data-borrar-busqueda="Sin mirar"/);
    assert.match(html, /Escapadas · Rural y naturaleza|Escapadas · [^<]*rural/i);
  });

  it('sin nada guardado explica cómo empezar, y las marcadas por ti salen en su lista', () => {
    const e = estadoPanel();
    e.busquedas = [];
    const [una] = ofertas;
    e.misEstados = new Map([[una.id, 'no-disponible']]);
    const html = vistaMis(e);
    assert.match(html, /Aún no has guardado ninguna búsqueda/);
    assert.match(html, /Guardar y avisarme/);
    assert.match(html, /Ya no disponibles/);
    assert.match(html, new RegExp(`data-ficha="${una.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  });
});
