/**
 * Los arreglos del plan de corrección (fases 1 y 2), cada uno con el caso real que lo destapó:
 * el hotel de Andorra con temas del menú de BuscoUnChollo, el paseo en barco de Sevilla tomado
 * por ferry, el apartamento de Platja d'Aro con estrellas de hotel y el paquete a Irlanda que sale
 * de Madrid. Los cuatro pasan por el escaneo entero, como en producción.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { estadoInicial, fusionar, restaurarDeLaFuente } from '../src/almacen.js';
import { escanear } from '../src/core/scan-pipeline.js';
import { aplicarFechasDelTexto, fechasDeTexto } from '../src/enriquecer/fechas-texto.js';
import { quitarFotoSinPermiso } from '../src/enriquecer/fotos.js';
import { anotarConocidaDesde, puntuar } from '../src/enriquecer/puntuacion.js';
import { limpiarTitulo } from '../src/enriquecer/titulos.js';
import { precioDe } from '../src/fuentes/escapadarural.js';
import { WEBS_DE_CHOLLOS } from '../src/fuentes/chollos.js';
import { definiciones, htmlPagina } from '../src/paginas.js';
import { formatearToponimo } from '../src/util/toponimos.js';
import { validarAjustes } from '../src/ajustes.js';
import { costeViaje } from '../site/js/coste.js';
import { esNovedad } from '../site/js/filtros.js';
import { reglaChollazo } from '../site/js/vistas-info.js';
import { AHORA, AJUSTES, oferta } from './ayudas.js';

const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };
const fuente = (id, ofertas) => ({
  id, nombre: id, web: `https://${id}.es`, modo: 'feed', requiere: [], urls: [`https://${id}.es/feed`], obtener: async () => ({ ofertas }),
});

/** Las cuatro ofertas tal como las dieron sus webs el 9 de octubre de 2026. */
const ANDORRA = {
  id: 'buscounchollo:39721', fuente: 'buscounchollo', tipo: 'escapada', precio: 20, unidad: 'pp', noches: 1, temas: [],
  titulo: '¡Respira Andorra! Naturaleza, aire fresco y hotel 4* en plena montaña',
  descripcion: '2 días y 1 noche en Arinsal, Andorra, alojado en Hotel Princesa Parc 4*, en régimen de Solo alojamiento + Parking exterior comunal a 350 metros del hotel (bajo disponibilidad) + Miniclub infantil todos los días. (de 10h a 22h).',
  // El menú entero de la web: 34 etiquetas, con «Solo alojamiento» y «Media pensión» a la vez.
  etiquetas: ['Fin de semana', 'Escapadas fin de semana', 'Cancelación gratuita', 'Desayuno', 'Montaña', 'Aventura', 'Spa', 'Escapada rural',
    'Mascotas', 'Entre semana', 'Escapada 1-2 noches', 'Piscina', 'Cumple tus sueños con BuscoUnChollo', 'Chollos para viajar en el 2027', 'Otoño',
    'Andorra', 'Internacional', 'Románticos', 'Octubre', 'Puente de Octubre', 'Puente de Noviembre', 'Noviembre', 'Diciembre', 'menos de 25 euros',
    'Menos de 49 euros', 'menos de 79 euros', 'menos de 99 euros', 'Puente de Diciembre', 'Más vendidos', 'Escapada de 3 a 6 noches',
    'Vacaciones 1 semana o más', 'Media pensión', 'Solo alojamiento', 'top-chollo'],
  lugar: { nombre: 'Arinsal', region: 'La Massana', pais: 'Andorra', lat: 42.5720821, lon: 1.4844029 },
};
const SEVILLA = {
  id: 'atrapalo:68967', fuente: 'atrapalo', tipo: 'escapada', precio: 63, unidad: 'pp', titulo: 'Escapada en Sevilla con paseo en barco por el Guadalquivir',
  descripcion: 'Sevilla', etiquetas: [], lugar: { nombre: 'Sevilla', region: null, pais: null, lat: 37.3886303, lon: -5.9953403 },
};
const PLATJA_DARO = {
  id: 'weekendesk:21371796', fuente: 'weekendesk', tipo: 'escapada', precio: 44.93, unidad: 'total', noches: 1,
  titulo: 'Escapada en Platja d’Aro en un equipado apartamento para que disfrutes a tu aire',
  descripcion: 'Aparthotel Comtat Sant Jordi (3*, 7,7/10 en 14 opiniones) · 1 noche en apartamento para 2 adultos',
  etiquetas: ['Venta flash', '3*', 'Apartamento'], lugar: { nombre: "Platja d'Aro", region: 'Cataluña', pais: 'España', lat: 41.8184693, lon: 3.0687997 },
};
const IRLANDA = {
  id: 'chollometro:2017108', fuente: 'chollometro', tipo: 'paquete', precio: 80, unidad: 'i/v', noches: 2, precioTexto: '80€',
  titulo: 'Irlanda con vuelos ida y vuelta + 2 noches en hostal céntrico. Desde Madrid del 13 al 15 diciembre. P.P (Min 2.p)',
  descripcion: '✈️ ¡ESCAPADA A IRLANDA POR POCO! ¿Te apetece una escapada navideña a Irlanda? Aprovecha esta oportunidad para viajar a Irlanda del 13 al 15 de diciembre, con vuelos de ida y vuelta + 2 noches de alojamiento céntrico. ✈️ Salida: Madrid Fechas: del 13 al 15 de diciembre Alojamiento: hostal céntrico…',
  etiquetas: ['Viajes', 'ViajerosPiratas', 'sale-de:Madrid'], lugar: { nombre: 'Irlanda', lat: 52.865196, lon: -7.9794599 },
};

async function escanearCasos(ajustes = AJUSTES) {
  const casos = [ANDORRA, SEVILLA, PLATJA_DARO, IRLANDA];
  const fuentes = [...new Set(casos.map((c) => c.fuente))].map((id) => fuente(id, casos.filter((c) => c.fuente === id).map((c) => oferta(structuredClone(c)))));
  const { salida } = await escanear({
    ajustes: { ...ajustes, fuentes: {} }, fuentes, http: sinRed, env: {}, log: () => {}, historial: {},
    ahora: AHORA, opciones: { sinEmails: true, forzar: true }, modulos,
  });
  return { salida, porId: new Map(salida.ofertas.ofertas.map((o) => [o.id, o])) };
}

describe('plan: los casos reales, por el escaneo entero', async () => {
  const { salida, porId } = await escanearCasos();

  it('Andorra: los temas salen del texto, no del menú de BuscoUnChollo (ni spa ni mascotas)', () => {
    const andorra = porId.get(ANDORRA.id);
    for (const tema of ['spa', 'mascotas', 'romantico']) assert.ok(!andorra.temas.includes(tema), `${tema}: ${andorra.temas}`);
    assert.ok(!definiciones(salida.ofertas).some((d) => d.ruta === 'escapadas/spa' && d.elegir(andorra)), 'no sale en la guía de spa');
    // Fechas flexibles: ni «cae en un puente» ni «el finde que viene».
    assert.equal(andorra.fechas.salida, null);
  });

  it('Sevilla: «paseo en barco» no es ir en ferry', () => {
    assert.ok([null, 'coche'].includes(porId.get(SEVILLA.id).transporte), porId.get(SEVILLA.id).transporte);
  });

  it("Platja d'Aro: es un apartamento, sin las estrellas de hotel", () => {
    const apartamento = porId.get(PLATJA_DARO.id);
    assert.equal(apartamento.alojamiento, 'apartamento');
    assert.equal(apartamento.estrellas, null);
  });

  it('Irlanda: sale de Madrid, con fechas fijas, por persona y fuera de las guías y del viaje completo', () => {
    const irlanda = porId.get(IRLANDA.id);
    assert.equal(irlanda.otraSalida, 'Madrid');
    assert.equal(irlanda.fechas.salida, '2026-12-13');
    assert.equal(irlanda.fechas.vuelta, '2026-12-15');
    assert.equal(irlanda.unidad, 'pp', 'vuelo + noches de hotel: paquete por persona, no billete de ida y vuelta');
    assert.deepEqual(definiciones(salida.ofertas).filter((d) => d.elegir(irlanda)).map((d) => d.ruta), []);
    const coste = costeViaje(irlanda, { viajeros: 2 });
    assert.equal(coste.total, null);
    assert.match(coste.falta.join(' '), /cómo llegar a Madrid/);
  });

  it('títulos sin emojis, gritos ni precios; el original se guarda aparte', () => {
    const irlanda = porId.get(IRLANDA.id);
    assert.ok(!/P\.P|Min 2/.test(irlanda.titulo), irlanda.titulo);
    assert.equal(irlanda.tituloOriginal, IRLANDA.titulo);
    for (const o of salida.ofertas.ofertas) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(o.titulo), o.titulo);
      assert.ok(!/\b\p{Lu}{5,}\b/u.test(o.titulo), `sin palabras gritadas: ${o.titulo}`);
    }
  });

  it('el «Chollazo» se explica con los umbrales de verdad', () => {
    const { vueloMax, escapadaNocheMax, puntuacionMin } = AJUSTES.emails.chollazos;
    assert.deepEqual(salida.ofertas.chollazos, { vueloMax, escapadaNocheMax, puntuacionMin });
    const texto = reglaChollazo(salida.ofertas.chollazos);
    for (const valor of [vueloMax, escapadaNocheMax, puntuacionMin]) assert.ok(texto.includes(String(valor)), `${valor} en ${texto}`);
    assert.match(reglaChollazo(null), /por debajo de lo normal/);
  });

  it('las fotos de webs sin permiso no se publican', () => {
    for (const o of salida.ofertas.ofertas) assert.equal(o.imagen ?? null, null, o.id);
  });
});

describe('plan: cada escaneo parte de lo que dijo su web', () => {
  it('una oferta guardada con temas de una regla vieja los pierde al volver a enriquecerla', () => {
    const estado = estadoInicial();
    fusionar(estado, 'buscounchollo', { ofertas: [oferta(structuredClone(ANDORRA))] }, AHORA);
    const guardada = estado.ofertas[ANDORRA.id];
    guardada.temas = ['spa', 'mascotas'];
    guardada.transporte = 'ferry';
    restaurarDeLaFuente(guardada);
    assert.deepEqual(guardada.temas, []);
    assert.equal(guardada.transporte, null);
    // Sin compartir objetos con la copia: enriquecer no cambia lo que dio la web.
    guardada.temas.push('rural');
    assert.deepEqual(guardada.deLaFuente.temas, []);
  });
});

describe('plan: fechas escritas en el texto', () => {
  const hoy = '2026-10-09';
  it('lee rangos cerrados y les pone el año', () => {
    assert.deepEqual(fechasDeTexto('Desde Madrid del 13 al 15 diciembre', hoy), { salida: '2026-12-13', vuelta: '2026-12-15' });
    assert.deepEqual(fechasDeTexto('Sería del 22 al 24 de Enero', hoy), { salida: '2027-01-22', vuelta: '2027-01-24' });
    assert.deepEqual(fechasDeTexto('del 30 de diciembre al 2 de enero', hoy), { salida: '2026-12-30', vuelta: '2027-01-02' });
  });

  it('no inventa: ejemplos, varias fechas o ventanas largas no son fechas cerradas', () => {
    assert.equal(fechasDeTexto('Ejemplo del 23 al 29 noviembre', hoy), null);
    assert.equal(fechasDeTexto('del 3 al 5 de diciembre o del 10 al 12 de diciembre', hoy), null);
    assert.equal(fechasDeTexto('del 1 de noviembre al 30 de diciembre', hoy), null);
    assert.equal(fechasDeTexto('Hotel en Roma', hoy), null);
  });

  it('solo a ofertas con alojamiento y sin fechas', () => {
    const vuelo = aplicarFechasDelTexto(oferta({ tipo: 'vuelo', titulo: 'Vuelos del 13 al 15 diciembre' }), hoy);
    assert.equal(vuelo.fechas.salida, null);
    const conFechas = aplicarFechasDelTexto(oferta({ tipo: 'hotel', titulo: 'del 13 al 15 diciembre', fechas: { salida: '2026-11-01', vuelta: '2026-11-02' } }), hoy);
    assert.equal(conFechas.fechas.salida, '2026-11-01');
  });
});

describe('plan: títulos y topónimos', () => {
  it('limpiarTitulo quita emojis, coletillas, precios y gritos', () => {
    assert.equal(limpiarTitulo('Mercados navideños en Riga🎄'), 'Mercados navideños en Riga');
    assert.equal(limpiarTitulo('Hotel 3* + desayuno en LA MASSANA, ANDORRA desde 15€ pp. Octubre'), 'Hotel 3* + desayuno en La Massana, Andorra. Octubre');
    assert.ok(!/esperas/i.test(limpiarTitulo('Escapada a Roma ¿A qué esperas?')));
    assert.equal(limpiarTitulo('Tren AVE a Madrid'), 'Tren AVE a Madrid', 'las siglas cortas se quedan');
    assert.equal(limpiarTitulo('Apartamento en LLORET DE MAR por 29€ pp. Actividades incluidas'), 'Apartamento en Lloret de Mar. Actividades incluidas');
    assert.equal(limpiarTitulo('Hotel en Roma desde 20€ p.p. con desayuno'), 'Hotel en Roma con desayuno');
    assert.equal(limpiarTitulo(''), '');
  });

  it('formatearToponimo: partículas en minúscula y elisiones', () => {
    assert.equal(formatearToponimo("Vall D'aran"), "Vall d'Aran");
    assert.equal(formatearToponimo('LA MASSANA'), 'La Massana');
    assert.equal(formatearToponimo('SANT JULIÀ DE RAMIS'), 'Sant Julià de Ramis');
  });
});

describe('plan: casas rurales de alquiler completo', () => {
  it('Escapada Rural: la casa entera cuesta lo de todas sus plazas', () => {
    assert.deepEqual(precioDe({ averagePrice: { amount: 2700, currency: 'EUR' }, rentType: 'FULL', capacity: { max: 8 } }), {
      precio: 216, unidad: 'noche', precioTexto: '≈ 216 € por noche la casa entera (27 € por persona y noche con las 8 plazas llenas)',
    });
    assert.equal(precioDe({ averagePrice: { amount: 2700 }, rentType: 'ROOMS', capacity: { max: 8 } }).unidad, 'pp/noche');
    assert.equal(precioDe({ averagePrice: null }).precio, null);
  });
});

describe('plan: «Nueva» por hotel y puente solo con fecha', () => {
  it('conocidaDesde: la primera vez que se vio ese hotel, también en otra oferta o en el historial', () => {
    const hace = (dias) => new Date(AHORA.getTime() - dias * 864e5).toISOString();
    const vieja = oferta({ titulo: 'Hotel Princesa Parc', vistaPrimera: hace(20) });
    const nueva = oferta({ titulo: 'Hotel Princesa Parc otra vez', vistaPrimera: hace(0.1) });
    const historial = { [nueva.id]: [['2026-09-01', 30]] };
    anotarConocidaDesde([vieja, nueva], historial, (o) => o.id);
    assert.ok(nueva.conocidaDesde < nueva.vistaPrimera, 'su historial empieza antes');
    assert.equal(esNovedad(nueva, AHORA.getTime() - 864e5), false, '«Nueva» no, aunque la oferta se viera ayer por primera vez');
  });

  it('una oferta de fechas flexibles no suma por puente', () => {
    const flexible = oferta({ tipo: 'hotel', precio: 50, unidad: 'pp/noche', fechas: { puenteId: 'pilar' } });
    const conFecha = oferta({ tipo: 'hotel', precio: 50, unidad: 'pp/noche', fechas: { salida: '2026-10-09', puenteId: 'pilar' } });
    puntuar([flexible, conFecha], AJUSTES, { ahora: AHORA });
    assert.equal(conFecha.puntuacion - flexible.puntuacion, 5);
  });
});

describe('plan: legal y contenido de terceros', () => {
  it('fotos: solo las de webs con permiso o las de Wikimedia Commons', () => {
    const permiso = new Set(['civitatis']);
    const de = (fuenteId, credito = null) => quitarFotoSinPermiso(oferta({ fuente: fuenteId, imagen: 'https://x.es/foto.jpg', imagenCredito: credito }), permiso);
    assert.equal(de('civitatis').imagen, 'https://x.es/foto.jpg');
    assert.equal(de('weekendesk').imagen, null);
    assert.equal(de('weekendesk', { texto: 'Foto: Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:X.jpg' }).imagen, 'https://x.es/foto.jpg');
    assert.equal(de('weekendesk', { texto: 'Foto', url: 'https://weekendesk.es/foto' }).imagen, null);
  });

  it('fotos.fuentesConPermiso se valida', () => {
    assert.deepEqual(validarAjustes({ ...AJUSTES, fotos: { fuentesConPermiso: ['civitatis'] } }), []);
    assert.equal(validarAjustes({ ...AJUSTES, fotos: { fuentesConPermiso: 'civitatis' } }).length, 1);
  });

  it('las webs de chollos son las que el plan nombra (y los canales y el buzón)', () => {
    for (const id of ['chollometro', 'viajerospiratas', 'buscounchollo', 'holidayguru', 'fly4free', 'buzon']) assert.ok(WEBS_DE_CHOLLOS.has(id), id);
    assert.ok(!WEBS_DE_CHOLLOS.has('atrapalo'));
  });

  it('«Contacto» en el pie de las guías solo si hay email', () => {
    const d = { ruta: 'escapadas', titulo: 'Escapadas', intro: 'Intro', panel: '#/escapadas' };
    const opciones = { raiz: '../', generado: AHORA.toISOString(), total: 0 };
    assert.match(htmlPagina(d, [], { ...opciones, contacto: 'hola@escapadasfinde.com' }), /<a href="mailto:hola@escapadasfinde\.com">Contacto<\/a>/);
    assert.ok(!htmlPagina(d, [], opciones).includes('mailto:'));
  });
});
