import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { conFechas, fechasDeBusqueda, ofertaConFechas } from '../site/js/fechas-enlaces.js';
import { buscarEscapadas, leerFiltrosEscapadas } from '../site/js/filtros.js';
import { busquedaPara, contenidoFicha, tarjeta } from '../site/js/plantillas.js';
import { oferta } from './ayudas.js';

const findes = [
  { id: '2026-10-02', viernes: '2026-10-02', sabado: '2026-10-03', domingo: '2026-10-04' },
  { id: '2026-10-16', viernes: '2026-10-16', sabado: '2026-10-17', domingo: '2026-10-18' },
];
const puentes = [{ id: 'puente-2026-10-10', desde: '2026-10-10', hasta: '2026-10-12', nombre: 'Pilar' }];
const ctxFechas = { finde: findes[0], puente: puentes[0], findes, puentes, noches: 2 };

describe('fechas que se buscan', () => {
  it('finde, puente, rango y día (con las noches del viaje)', () => {
    assert.deepEqual(fechasDeBusqueda({ cuando: '2026-10-16' }, ctxFechas), { entrada: '2026-10-16', salida: '2026-10-18', etiqueta: '16–18 oct' });
    assert.equal(fechasDeBusqueda({ cuando: 'finde' }, ctxFechas).entrada, '2026-10-02');
    // Un puente entra el último laborable (viernes), como cuentan la franja y el encaje; no el primer día libre.
    assert.deepEqual(fechasDeBusqueda({ cuando: 'puente-2026-10-10' }, ctxFechas), { entrada: '2026-10-09', salida: '2026-10-12', etiqueta: '9–12 oct' });
    assert.equal(fechasDeBusqueda({ cuando: 'puente' }, ctxFechas).entrada, '2026-10-09');
    assert.equal(fechasDeBusqueda({ cuando: 'puente-2026-10-10' }, { ...ctxFechas, puentes: [{ ...puentes[0], salidas: undefined }] }).entrada, '2026-10-09', 'sin «salidas», el día anterior');
    assert.deepEqual(fechasDeBusqueda({ desde: '2026-11-06', hasta: '2026-11-09' }, ctxFechas), { entrada: '2026-11-06', salida: '2026-11-09', etiqueta: '6–9 nov' });
    assert.equal(fechasDeBusqueda({ desde: '2026-11-06', hasta: '2026-11-06' }, { ...ctxFechas, noches: 3 }).salida, '2026-11-09', 'un día: + las noches del viaje');
    assert.equal(fechasDeBusqueda({}, ctxFechas), null);
    assert.equal(fechasDeBusqueda({ desde: 'mañana' }, ctxFechas), null);
  });

  it('nunca con una entrada ya pasada: el sábado se entra el sábado; sin noches por delante, sin fechas', () => {
    const finde = { cuando: '2026-10-16' };
    assert.equal(fechasDeBusqueda(finde, { ...ctxFechas, hoy: '2026-10-15' }).entrada, '2026-10-16', 'antes del finde, el viernes');
    assert.deepEqual(fechasDeBusqueda(finde, { ...ctxFechas, hoy: '2026-10-17' }), { entrada: '2026-10-17', salida: '2026-10-18', etiqueta: '17–18 oct' });
    assert.equal(fechasDeBusqueda(finde, { ...ctxFechas, hoy: '2026-10-18' }), null, 'el domingo ya no queda noche');
    assert.equal(fechasDeBusqueda({ cuando: 'puente-2026-10-10' }, { ...ctxFechas, hoy: '2026-10-11' }).entrada, '2026-10-11', 'a mitad del puente, desde hoy');
    assert.equal(fechasDeBusqueda({ desde: '2026-10-01', hasta: '2026-10-20' }, { ...ctxFechas, hoy: '2026-10-04' }).entrada, '2026-10-04');
  });
});

describe('enlaces con las fechas buscadas', () => {
  const fechas = { entrada: '2026-10-16', salida: '2026-10-18' };

  it('Booking, Airbnb, Trivago, Skyscanner, KAYAK, Google Flights, GetYourGuide y Omio', () => {
    const booking = new URL(conFechas('https://www.booking.com/searchresults.es.html?ss=Roses&checkin=2026-10-02&checkout=2026-10-04&group_adults=2&no_rooms=1', fechas, 3));
    assert.deepEqual([booking.searchParams.get('checkin'), booking.searchParams.get('checkout'), booking.searchParams.get('group_adults'), booking.searchParams.get('ss')], ['2026-10-16', '2026-10-18', '3', 'Roses']);
    assert.match(conFechas('https://www.airbnb.es/s/Roses/homes?checkin=2026-10-02&checkout=2026-10-04&adults=2', fechas), /checkin=2026-10-16&checkout=2026-10-18&adults=2/);
    assert.match(decodeURIComponent(conFechas('https://www.trivago.es/es/srl?search=200-13437;dr-20261002-20261004;rc-1-2', fechas, 4)), /dr-20261016-20261018;rc-1-4/);
    assert.match(conFechas('https://www.skyscanner.es/transporte/vuelos/bcn/opo/261002/261004/?adultsv2=1', fechas, 2), /\/bcn\/opo\/261016\/261018\/\?adultsv2=2$/);
    assert.match(conFechas('https://www.kayak.es/flights/BCN-OPO/2026-10-02/2026-10-04?sort=price_a', fechas, 2), /\/BCN-OPO\/2026-10-16\/2026-10-18\/2adults\?sort=price_a$/);
    assert.match(decodeURIComponent(new URL(conFechas('https://www.google.com/travel/flights?q=Vuelos%20de%20BCN%20a%20OPO%20el%202026-10-02%20vuelta%202026-10-04&hl=es', fechas)).searchParams.get('q')), /el 2026-10-16 vuelta 2026-10-18/);
    assert.match(conFechas('https://www.getyourguide.es/s/?q=Roses&date_from=2026-10-02', fechas), /date_from=2026-10-16&date_to=2026-10-18/);
    assert.match(conFechas('https://www.omio.es/search-frontend/results?departurePosition=Barcelona&arrivalPosition=Roses&departureDate=2026-10-02', fechas), /departureDate=2026-10-16/);
  });

  it('la web de la oferta, solo si entiende las fechas en la URL (Holidu, Clubrural)', () => {
    assert.equal(ofertaConFechas('https://www.holidu.es/d/47720395', fechas, 3), 'https://www.holidu.es/d/47720395?checkin=2026-10-16&checkout=2026-10-18&adults=3');
    assert.match(ofertaConFechas('https://www.clubrural.com/s/Madrid?propertyType=AGRITOURISM&includeOfferIds=56956009', fechas), /includeOfferIds=56956009&checkin=2026-10-16&checkout=2026-10-18&adults=2$/);
    for (const url of ['https://www.weekendesk.es/fin-de-semana/21843318/lloret', 'https://www.atrapalo.com/escapadas/x_v69292', 'no es una url']) assert.equal(ofertaConFechas(url, fechas), null, url);
  });

  it('las demás webs, tal cual', () => {
    for (const url of ['https://www.civitatis.com/es/buscar/?q=Roses', 'https://www.google.com/maps/dir/?api=1&origin=1,2', 'no es una url']) {
      assert.equal(conFechas(url, fechas), url);
    }
  });
});

describe('ofertas de fechas flexibles y de fechas cerradas', () => {
  const busqueda = { entrada: '2026-10-16', salida: '2026-10-18', etiqueta: '16–18 oct' };
  const ctx = { fuentes: new Map(), temas: new Map(), historial: {}, favoritos: new Set(), viajeros: 3, noches: 2, busqueda };
  const flexible = oferta({
    titulo: 'Hotel en Roses', lugar: { nombre: 'Roses' }, precio: 50, unidad: 'pp', caduca: '2026-12-31T22:00:00.000Z',
    enlaces: [
      { etiqueta: 'Hoteles en Booking', url: 'https://www.booking.com/searchresults.es.html?ss=Roses&checkin=2026-10-02&checkout=2026-10-04&group_adults=2' },
      { etiqueta: 'Este alojamiento en Booking', grupo: 'este-alojamiento', url: 'https://www.booking.com/searchresults.es.html?ss=Hotel%20X&checkin=2026-10-02&checkout=2026-10-04&group_adults=2' },
    ],
    establecimiento: 'Hotel X',
  });

  it('la flexible: la tarjeta dice que puede valer y los buscadores abren tus fechas (la web de la oferta, tal cual)', () => {
    assert.equal(busquedaPara(flexible, ctx), busqueda);
    assert.match(tarjeta(flexible, ctx), /Puede valer para el 16–18 oct/);
    const html = contenidoFicha(flexible, ctx);
    assert.match(html, /checkin=2026-10-16&amp;checkout=2026-10-18&amp;group_adults=3/);
    assert.doesNotMatch(html, /checkin=2026-10-02/, 'ni en «Organiza el viaje» ni en «Comparar precios»');
    assert.match(html, /Organiza el viaje <span class="suave">\(hotel, actividades, cómo llegar · 16–18 oct\)<\/span>/);
    assert.match(html, /Los buscadores de abajo ya abren tus fechas \(16–18 oct\)/);
    assert.match(html, /href="https:\/\/ejemplo\.es\/oferta"/, 'la web de la oferta no se toca');
  });

  it('Holidu abre la oferta con tus fechas; en las demás, la ficha dice qué fechas elegir', () => {
    const holidu = { ...flexible, fuente: 'holidu', url: 'https://www.holidu.es/d/47720395', urlReserva: null };
    const ctxHolidu = { ...ctx, fuentes: new Map([['holidu', 'Holidu'], ['prueba', 'Prueba']]) };
    assert.match(tarjeta(holidu, ctxHolidu), /href="https:\/\/www\.holidu\.es\/d\/47720395\?checkin=2026-10-16&amp;checkout=2026-10-18&amp;adults=3"/);
    const ficha = contenidoFicha(holidu, ctxHolidu);
    assert.match(ficha, /Se abre con tus fechas: <strong>16–18 oct<\/strong>/);
    assert.match(ficha, /class="ficha__reserva"[^]*checkin=2026-10-16/, 'también la barra del móvil');
    assert.match(contenidoFicha(flexible, ctxHolidu), /Prueba no deja abrirla con fechas: al reservar, elige <strong>16–18 oct<\/strong>/);
    const sinBusqueda = contenidoFicha(holidu, { ...ctxHolidu, busqueda: null });
    assert.doesNotMatch(sinBusqueda, /nota-fechas|holidu\.es\/d\/47720395\?/);
    assert.match(sinBusqueda, /href="https:\/\/www\.holidu\.es\/d\/47720395"/, 'sin fechas buscadas, tal cual');
  });

  it('la de fechas cerradas o la que caduca antes conservan lo suyo', () => {
    const cerrada = { ...flexible, fechas: { ...flexible.fechas, salida: '2026-10-16', vuelta: '2026-10-18' } };
    assert.equal(busquedaPara(cerrada, ctx), null);
    assert.match(contenidoFicha(cerrada, ctx), /checkin=2026-10-02/);
    assert.equal(busquedaPara({ ...flexible, caduca: '2026-10-10T21:59:59.000Z' }, ctx), null);
    assert.equal(busquedaPara(flexible, { ...ctx, busqueda: null }), null);
  });

  it('un rango solo trae las estancias que caben dentro; un día, las que lo incluyen', () => {
    const estancia = (salida, vuelta) => oferta({ tipo: 'hotel', precio: 60, unidad: 'total', fechas: { salida, vuelta } });
    const dentro = estancia('2026-10-16', '2026-10-18');
    const aCaballo = estancia('2026-10-14', '2026-10-17');
    const lista = [dentro, aCaballo];
    const ids = (params) => buscarEscapadas(lista, leerFiltrosEscapadas(params), { hoy: '2026-10-01' }).ofertas.map((o) => o.id);
    assert.deepEqual(ids({ desde: '2026-10-16', hasta: '2026-10-18' }), [dentro.id]);
    assert.deepEqual(ids({ desde: '2026-10-17', hasta: '2026-10-17' }).sort(), [dentro.id, aCaballo.id].sort());
  });

  it('la previsión y los eventos del próximo finde no salen si buscas otras fechas; los de tus fechas, sí', () => {
    const conExtras = {
      ...flexible,
      fechas: { ...flexible.fechas, findeId: '2026-10-02' },
      tiempo: { dia: '2026-10-03', maxC: 25, texto: 'nublado', codigo: 3 },
      eventos: [{ nombre: 'Feria del 3', fecha: '2026-10-03' }, { nombre: 'Mercado del 17', fecha: '2026-10-17' }],
    };
    const html = contenidoFicha(conExtras, ctx);
    assert.doesNotMatch(html, /nublado|Feria del 3/);
    assert.match(html, /Qué hay por la zona esos días \(16–18 oct\)[^]*Mercado del 17/);
    const sinBusqueda = contenidoFicha(conExtras, { ...ctx, busqueda: null });
    assert.match(sinBusqueda, /nublado[^]*Feria del 3/);
  });
});
