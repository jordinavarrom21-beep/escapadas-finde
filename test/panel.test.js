import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  actividadesCerca, actividadesPara, analizarConsulta, buscarActividades, buscarEscapadas, buscarTexto,
  chollosDeVuelos, crearHash, criterioVigilado, describirCriterio, destinosDeVuelo, diasAPedir, disponibleEn,
  duracionActividad, esActividad, esNovedad, filtrarVuelos, leerFiltrosActividades, leerFiltrosComunes,
  leerFiltrosEscapadas, leerFiltrosVuelos, leerRuta, medirDistancias, perfilFavoritos, periodoFinde,
  planesSorpresa, recomendadas, referenciaNovedades, resumenCalendario, resumenFuentes, resumenPuentes,
  urlEditarVigilados, vuelosParaMapa,
} from '../site/js/filtros.js';
import { estadoFinde, findesProximos, proximoPuente } from '../site/js/fechas.js';
import { cuentaAtras, euros } from '../site/js/formato.js';
import { parsearPhoton, urlPhoton } from '../site/js/geo.js';
import { contenidoFicha, tarjeta } from '../site/js/plantillas.js';
import {
  contenidoSorpresa, resultadosVuelos, vistaActividades, vistaCalendario, vistaEscapadas, vistaFinde,
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
    assert.ok(filtrarVuelos(ofertas, { ...f, ideal: true }, ctxBusqueda).every((o) => o.vuelo.horarioIdeal));
    assert.ok(filtrarVuelos(ofertas, { ...leerFiltrosVuelos(), pais: 'Italia' }, ctxBusqueda).every((o) => o.lugar.pais === 'Italia'));
  });

  it('admite el id de un puente en el selector de finde', () => {
    const lista = filtrarVuelos(ofertas, { ...leerFiltrosVuelos(), finde: puente.id }, ctxBusqueda);
    assert.ok(lista.length > 0);
    assert.ok(lista.every((o) => o.fechas.puenteId === puente.id));
  });

  it('también aplica a los vuelos los filtros de chollo (chollazo, bajada y puntuación)', () => {
    const chollazos = filtrarVuelos(ofertas, leerFiltrosVuelos({ cho: '1' }), ctxBusqueda);
    assert.ok(chollazos.length > 0 && chollazos.every((o) => o.chollazo));
    assert.ok(filtrarVuelos(ofertas, leerFiltrosVuelos({ pts: '80' }), ctxBusqueda).every((o) => o.puntuacion >= 80));
    assert.ok(filtrarVuelos(ofertas, leerFiltrosVuelos({ baja: '1' }), ctxBusqueda).every((o) => o.bajada > 0));
  });

  it('funciona solo con chollos de vuelos sin campo «vuelo» (Ryanair desactivada)', () => {
    const soloChollos = ofertas.filter((o) => !o.vuelo);
    const f = leerFiltrosVuelos({ finde: finde.id, ideal: '1', max: '30' });
    assert.deepEqual(filtrarVuelos(soloChollos, f, ctxBusqueda), []);
    const chollos = chollosDeVuelos(soloChollos, f, ctxBusqueda);
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

describe('filtros nuevos de escapadas', () => {
  it('precio por persona y noche, descuento, bajada, mínimo histórico, chollazo y puntuación', () => {
    const baratas = buscar({ pnMax: '25' });
    assert.ok(baratas.length > 0 && baratas.every((o) => o.precioNoche <= 25));
    assert.ok(buscar({ pnMin: '60' }).every((o) => o.precioNoche >= 60));
    assert.equal(buscar({ pnMin: '30', pnMax: '25' }).length, 0);
    assert.ok(buscar({ dto: '35' }).every((o) => o.descuento >= 35));
    assert.ok(buscar({ baja: '1' }).every((o) => o.bajada > 0));
    assert.ok(buscar({ hist: '1' }).every((o) => o.minimoHistorico));
    assert.ok(buscar({ cho: '1' }).every((o) => o.chollazo));
    assert.ok(buscar({ pts: '70' }).every((o) => o.puntuacion >= 70));
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
    assert.ok(buscar({ noches: '1' }).every((o) => o.noches === 1));
    const clasicas = buscar({ clasica: '1' });
    assert.ok(clasicas.length > 0 && clasicas.every((o) => o.noches === 2));
    const sinSpa = buscar({ notemas: 'spa,playa' });
    assert.ok(sinSpa.length > 0 && !sinSpa.some((o) => o.temas.includes('spa') || o.temas.includes('playa')));
    assert.ok(!nombres(buscar({ nodest: 'Sitges,Girona' })).some((n) => ['Sitges', 'Girona'].includes(n)));
  });

  it('oculta las duplicadas salvo que se pidan y quita las descartadas cuando se activa', () => {
    const duplicada = porId('nomolesten:hotel-boutique-con-piscina-en-sitges');
    assert.ok(duplicada.etiquetas.includes('duplicada'));
    assert.ok(!buscar({}).includes(duplicada), 'las repetidas no se ven por defecto');
    assert.ok(buscar({ dup: '1' }).includes(duplicada));
    const descartadas = new Set([buscar({})[0].id]);
    assert.equal(buscar({ sindesc: '1' }, { descartadas }).length, buscar({}).length - 1);
    assert.equal(buscar({}, { descartadas }).length, buscar({}).length, 'sin el filtro siguen saliendo');
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
    assert.match(html, /4 actividades · 4 gratuitas/);
    assert.match(html, /<strong class="precio__gratis">Gratis<\/strong> <span class="precio__unidad">propina voluntaria/);
    assert.match(html, /⏱️ 2 h 30 min/);
    assert.match(html, /Actividad · GuruWalk/);
    assert.match(vistaActividades(estadoPanel(), { temas: 'gastronomia', nota: '9.9' }), /Ninguna actividad cumple estos filtros/);
  });

  it('la portada las propone y la ficha enseña qué hacer allí', () => {
    const portada = vistaFinde(estadoPanel(), {});
    assert.match(portada, /🎟️ Actividades para este finde/);
    assert.match(portada, /href="#\/actividades"/);

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
    assert.match(vistaEscapadas(estadoPanel(), {}), /name="cru" value="1" data-defecto checked>\s*🚢 Ocultar cruceros/);
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
      texto: 'spa',
      tipo: 'hotel',
      temas: ['spa', 'rural'],
      precioMax: 90,
      cocheMaxMin: 120,
      cerca: { lat: 41.9794, lon: 2.8214, radioKm: 123 },
      puente: true,
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
    assert.deepEqual(resumenFuentes(datos.fuentes), { activas: 9, ok: 8, conError: 1, inactivas: 2 });
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
    const besalu = tarjeta(porId('chollometro:besalu-casa-rural-para-6-personas-por-18'), ctxTarjeta);
    assert.match(besalu, /Un 35 % por debajo de lo normal/);
    assert.match(besalu, /🏡 Casa rural/);
    assert.match(besalu, /⭐ 8/);
    assert.match(besalu, /de coche ida y vuelta para 2 personas/);
    assert.match(besalu, /Mercat medieval de Besalú/);
    assert.match(besalu, /por persona y noche/);
    assert.match(besalu, /data-descartar="chollometro:besalu/);

    const sitges = tarjeta(porId('chollometro:hotel-en-sitges-para-el-festival-de-cine'), ctxTarjeta);
    assert.match(sitges, /También en <a[^>]*>No Molesten<\/a>/);
    assert.match(sitges, /Lluvia ligera · 23° · 65 % de lluvia/);
    assert.match(sitges, /🔥 Chollazo/);
  });

  it('lo que no está no se enseña', () => {
    const pelada = {
      ...porId('chollometro:besalu-casa-rural-para-6-personas-por-18'),
      referencia: null, equivalentes: [], costeCoche: null, tiempo: null, eventos: [],
      valoracion: null, precioNoche: null, alojamiento: null,
    };
    const html = tarjeta(pelada, ctxTarjeta);
    assert.ok(!/por debajo de lo normal|También en|de coche ida y vuelta|class="eventos"|⭐|por persona y noche/.test(html));
  });
});

describe('vistas nuevas', () => {
  it('la portada propone planes sorpresa y recomendados según los favoritos', () => {
    const e = estadoPanel();
    e.favoritos = new Set([ofertas.find((o) => o.temas.includes('spa') && o.tipo !== 'vuelo').id]);
    const html = vistaFinde(e, {});
    assert.match(html, /✨ Sorpréndeme/);
    assert.match(html, /data-sorpresa/);
    assert.match(html, /Recomendado para ti/);
    assert.match(html, /✨ Porque te gustan los planes de/);
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
    for (const campo of ['q', 'pnMin', 'pnMax', 'dto', 'pts', 'nota', 'aloj', 'region', 'sincoche', 'clasica', 'desde', 'cho', 'sindesc', 'dup', 'cru']) {
      assert.match(html, new RegExp(`name="${campo}"`), `falta el filtro ${campo}`);
    }
    assert.match(html, /<option value="casa-rural" selected/);
    assert.match(html, /🚫 Sitges/);
    assert.match(html, /data-copiar-vigilado="escapadas"/);
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
