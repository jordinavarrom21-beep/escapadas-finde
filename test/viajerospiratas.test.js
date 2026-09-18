import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import fuente, {
  extraerLugar,
  extraerNoches,
  extraerRegimen,
  interpretarPrecio,
  limpiarTitulo,
  parsear,
  tipoPorUrl,
} from '../src/fuentes/viajerospiratas.js';
import { validarOferta } from '../src/modelo.js';

const FEED = readFileSync(new URL('./fixtures/viajerospiratas-feed.xml', import.meta.url), 'utf8');

function contextoFalso() {
  const logs = [];
  return { logs, log: (mensaje) => logs.push(mensaje) };
}

const ofertas = parsear(FEED, contextoFalso());
const porUrl = (ruta) => ofertas.find((o) => o.url === `https://www.viajerospiratas.es/${ruta}`);

function feedCon(items) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ViajerosPiratas</title>${items}</channel></rss>`;
}

describe('parsear (feed real)', () => {
  it('convierte todas las entradas en ofertas válidas sin descartar ninguna', () => {
    const ctx = contextoFalso();
    const resultado = parsear(FEED, ctx);
    assert.equal(resultado.length, 42);
    assert.deepEqual(ctx.logs, []);
    for (const oferta of resultado) assert.deepEqual(validarOferta(oferta), [], oferta.id);
  });

  it('genera ids estables y únicos a partir de la ruta', () => {
    const ids = ofertas.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('viajerospiratas:vacaciones/escapada-fin-de-semana-portugal-lisboa'));
    assert.ok(ids.every((id) => id.startsWith('viajerospiratas:')));
  });

  it('limpia los títulos y recorta las descripciones', () => {
    for (const oferta of ofertas) {
      assert.doesNotMatch(oferta.titulo, /\p{Extended_Pictographic}|\p{Regional_Indicator}|\s{2}|^\s|\s$/u, oferta.titulo);
      assert.ok(oferta.descripcion.length <= 300, oferta.id);
    }
  });

  it('interpreta la escapada a Lisboa', () => {
    const lisboa = porUrl('vacaciones/escapada-fin-de-semana-portugal-lisboa');
    assert.equal(lisboa.titulo, 'Escapada de fin de semana a Lisboa');
    assert.equal(lisboa.tipo, 'paquete');
    assert.deepEqual(lisboa.lugar, { nombre: 'Lisboa' });
    assert.equal(lisboa.precio, 99);
    assert.equal(lisboa.precioTexto, 'desde 99€');
    assert.equal(lisboa.unidad, null);
    assert.equal(lisboa.noches, 2);
    assert.equal(lisboa.publicada, '2026-09-17T11:10:11.000Z');
    assert.match(lisboa.imagen, /^https:\/\/image\.urlaubspiraten\.de\/.+\.jpg$/);
    assert.deepEqual(lisboa.etiquetas, ['vacaciones']);
  });

  it('prioriza el precio por persona y conserva el fragmento original', () => {
    const alsacia = porUrl('hoteles/holidu-alsacia-apartamento-familia');
    assert.equal(alsacia.tipo, 'hotel');
    assert.equal(alsacia.precio, 108);
    assert.equal(alsacia.unidad, 'pp');
    assert.equal(alsacia.precioTexto, 'desde 432€, 108€ por persona');
    assert.equal(alsacia.noches, 3);
    assert.deepEqual(alsacia.lugar, { nombre: 'Alsacia' });
    assert.equal(alsacia.publicada, '2026-09-17T17:57:00.000Z');
  });

  it('interpreta el hotel con media pensión en Calella', () => {
    const calella = porUrl('hoteles/hotel-con-parque-acuatico-y-pension-completa-en-calella-buc-wl');
    assert.equal(calella.titulo, 'Hotel 4* con parque acuático y media pensión en Calella');
    assert.equal(calella.regimen, 'media-pension');
    assert.equal(calella.precio, 36);
    assert.equal(calella.unidad, 'pp');
    assert.deepEqual(calella.lugar, { nombre: 'Calella' });
  });

  it('interpreta el hotel spa del País Vasco', () => {
    const orduna = porUrl('hoteles/escapada-orduna-traventia-septiembre');
    assert.equal(orduna.titulo, 'Hotel spa 4* en el País Vasco');
    assert.deepEqual(orduna.lugar, { nombre: 'País Vasco' });
    assert.equal(orduna.precio, 76);
    assert.equal(orduna.precioTexto, 'desde 76€ por persona');
    assert.equal(orduna.regimen, 'desayuno');
  });

  it('marca como vuelo sin datos de vuelo la promoción de Qatar Airways', () => {
    const qatar = porUrl('vuelos/promocion-qatar-airways-septiembre-2026');
    assert.equal(qatar.titulo, 'Hasta un 20% de descuento en vuelos de QATAR AIRWAYS');
    assert.equal(qatar.tipo, 'vuelo');
    assert.equal(qatar.vuelo, null);
    assert.equal(qatar.transporte, 'avion');
    assert.equal(qatar.lugar, null);
    assert.equal(qatar.precio, 587);
    assert.equal(qatar.unidad, 'i/v');
    assert.equal(qatar.precioTexto, 'desde unos 587€ ida y vuelta');
  });

  it('usa pp/noche cuando el precio por persona acompaña a un precio por noche', () => {
    const puente = porUrl('hoteles/escapada-puente-de-octubre');
    assert.equal(puente.titulo, 'Hoteles para el Puente de Octubre');
    assert.equal(puente.lugar, null);
    assert.equal(puente.precio, 22);
    assert.equal(puente.unidad, 'pp/noche');
    assert.equal(puente.precioTexto, 'desde 44€ por noche, 22€ por persona');

    const laManga = porUrl('hoteles/2-noches-pension-completa-toboganes-la-manga-buc-wl');
    assert.equal(laManga.precio, 59);
    assert.equal(laManga.unidad, 'pp/noche');
    assert.equal(laManga.regimen, 'pension-completa');
    assert.deepEqual(laManga.lugar, { nombre: 'La Manga' });
  });

  it('ignora los suplementos que se pagan aparte', () => {
    const egipto = porUrl('vacaciones/viaje-egipto-crucero-logitravel-sept-2026');
    assert.notEqual(egipto.precio, 135);
    assert.equal(egipto.regimen, 'pension-completa');
    assert.deepEqual(egipto.lugar, { nombre: 'Egipto' });
  });

  it('incluye también las entradas sin precio', () => {
    const revista = porUrl('revista-de-viajes/hoteles-picantes');
    assert.equal(revista.tipo, 'escapada');
    assert.equal(revista.precio, null);
    assert.equal(revista.precioTexto, '');
    assert.equal(revista.unidad, null);

    const puente = porUrl('viajes/calendario-de-viajes/puente-noviembre');
    assert.equal(puente.tipo, 'paquete');
  });
});

describe('parsear (casos límite)', () => {
  it('omite y registra solo las entradas que no se pueden interpretar', () => {
    const ctx = contextoFalso();
    const xml = feedCon(`
      <item><title>Sin enlace</title><description>Desde 20€</description></item>
      <item><title>🏖️ Hotel en  Salou</title><link>https://www.viajerospiratas.es/hoteles/salou?utm_source=rss#top</link>
        <description><![CDATA[<p>Hotel en Salou desde <b>30&euro;</b> por persona.</p>]]></description>
        <pubDate>no es una fecha</pubDate></item>`);
    const resultado = parsear(xml, ctx);
    assert.equal(resultado.length, 1);
    assert.equal(ctx.logs.length, 1);
    assert.match(ctx.logs[0], /Sin enlace/);

    const [salou] = resultado;
    assert.equal(salou.titulo, 'Hotel en Salou');
    assert.equal(salou.url, 'https://www.viajerospiratas.es/hoteles/salou');
    assert.equal(salou.id, 'viajerospiratas:hoteles/salou');
    assert.equal(salou.descripcion, 'Hotel en Salou desde 30€ por persona.');
    assert.equal(salou.precio, 30);
    assert.equal(salou.unidad, 'pp');
    assert.equal(salou.imagen, null);
    assert.equal(salou.publicada, null);
  });

  it('devuelve una lista vacía si el feed no tiene entradas', () => {
    assert.deepEqual(parsear(feedCon(''), contextoFalso()), []);
  });

  it('lanza un error claro si la respuesta no es un feed RSS', () => {
    const desafio = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>';
    assert.throws(() => parsear(desafio, contextoFalso()), /no es un feed RSS/);
  });
});

describe('extraerLugar', () => {
  const casos = [
    ['🇵🇹 Escapada de fin de semana a Lisboa', 'Lisboa'],
    ['Hotel 4* con parque acuático y media pensión en Calella 🌞', 'Calella'],
    ['🧖‍♀️ Hotel spa 4* en el País Vasco', 'País Vasco'],
    ['🔥 ¡ÚLTIMA HORA! Media Pensión en la Costa Brava', 'Costa Brava'],
    ['❤️ Escapada a Alsacia en familia', 'Alsacia'],
    ['🇪🇬 Viajazo por Egipto con crucero ¡8 días!', 'Egipto'],
    ['🌻 Hotel en Londres cerca de Covent Garden', 'Londres'],
    ['🇻🇳 Ruta por VIETNAM con WeRoad ¡10 días!', 'Vietnam'],
    ['🍷 Viaje en finde a Oporto', 'Oporto'],
    ['🫰 ¡Paquete de 11 días por Corea del Sur!', 'Corea del Sur'],
    ['🌟 Viaje de 5 días a Londres y Budapest', 'Londres'],
    ['⛰️ Hotel con spa y desayuno incluido en Alcalá del Júcar 🧘🏻‍♀️', 'Alcalá del Júcar'],
    ['Pensión Completa y toboganes en La Manga 🏝️', 'La Manga'],
    ['Hotel TODO INCLUIDO con vistas al Lago de Garda ⛵️🫰🏻', 'Lago de Garda'],
    ['🏞  Paquete de 8 días por los Fiordos Noruegos', 'Fiordos Noruegos'],
    ['Hotel 4* a pie de playa en Calpe 🌺', 'Calpe'],
    ['💥 CHOLLO 💥 Paquete a PortAventura World🎢', 'PortAventura World'],
    ['Escapada a la COSTA DEL SOL', 'Costa del Sol'],
    ['Hoteles para el Puente de Octubre 😎', null],
    ['✈️ Hasta un 20% de descuento en vuelos de QATAR AIRWAYS 🌎', null],
    ['⚡️ Escapadas relámpago: disfruta de un destino en un solo día ⚡️', null],
    ['🏝️ TENERIFE con media pensión ¡4 a 7 noches!', null],
    ['☀️ Viajes para OCTUBRE', null],
  ];
  for (const [titulo, esperado] of casos) {
    it(`${titulo} → ${esperado}`, () => assert.equal(extraerLugar(titulo), esperado));
  }
});

describe('limpiarTitulo', () => {
  it('quita emojis, banderas y espacios sobrantes pero no las estrellas', () => {
    assert.equal(limpiarTitulo(' 🇧🇪 Ruta de 6 días por Flandes ❤️'), 'Ruta de 6 días por Flandes');
    assert.equal(limpiarTitulo('⛰️ Hotel 4* en Alcalá del Júcar 🧘🏻‍♀️'), 'Hotel 4* en Alcalá del Júcar');
    assert.equal(limpiarTitulo('Roquetas de Mar con media pensión y toboganes 🛝⛱️'), 'Roquetas de Mar con media pensión y toboganes');
  });
});

describe('interpretarPrecio', () => {
  it('prioriza «por persona» y «p.p.» sobre el resto de cantidades', () => {
    assert.deepEqual(interpretarPrecio('Desde 200€ la habitación. Oferta: 45€ p.p. con desayuno'),
      { precio: 45, precioTexto: '45€ p.p.', unidad: 'pp' });
    assert.deepEqual(interpretarPrecio('Paquete por 1.299€ por persona'),
      { precio: 1299, precioTexto: '1.299€ por persona', unidad: 'pp' });
  });

  it('usa después la cantidad que va tras «desde»', () => {
    assert.deepEqual(interpretarPrecio('Ahorra 15€ en este apartamento desde 60€ por noche'),
      { precio: 60, precioTexto: 'desde 60€ por noche', unidad: 'noche' });
  });

  it('usa la primera cantidad si no hay ninguna pista', () => {
    assert.deepEqual(interpretarPrecio('Vuelos a Roma por 20€ i/v y a Milán por 25€'),
      { precio: 20, precioTexto: '20€ i/v', unidad: 'i/v' });
    assert.deepEqual(interpretarPrecio('Hotel por 80€ en Girona'),
      { precio: 80, precioTexto: '80€', unidad: null });
  });

  it('descarta descuentos y suplementos', () => {
    assert.deepEqual(interpretarPrecio('Hasta 200€ de descuento. Hay que sumarle unos 35€ por persona de tasas.'),
      { precio: null, precioTexto: '', unidad: null });
  });
});

describe('extraerNoches y extraerRegimen', () => {
  it('lee el número de noches (el mínimo si es un rango)', () => {
    assert.equal(extraerNoches('vuelos y 2 o 3 noches en un hotel céntrico'), 2);
    assert.equal(extraerNoches('TENERIFE con media pensión ¡4 a 7 noches!'), 4);
    assert.equal(extraerNoches('un viaje de 2 días y una noche de hotel'), 1);
    assert.equal(extraerNoches('si te alojas a partir de 4 noches tendrás spa'), null);
    assert.equal(extraerNoches('desde 76€ la noche'), null);
  });

  it('detecta el primer régimen que se menciona', () => {
    assert.equal(extraerRegimen('Viaje TODO INCLUIDO a Lanzarote'), 'todo-incluido');
    assert.equal(extraerRegimen('crucero con pensión completa y hotel con desayunos'), 'pension-completa');
    assert.equal(extraerRegimen('Hotel 4* con Media Pensión'), 'media-pension');
    assert.equal(extraerRegimen('tarifa en solo alojamiento'), 'solo-alojamiento');
    assert.equal(extraerRegimen('Hotel boutique en Palencia'), null);
  });
});

describe('tipoPorUrl', () => {
  it('deduce el tipo de la sección de la URL', () => {
    assert.equal(tipoPorUrl('https://www.viajerospiratas.es/hoteles/x'), 'hotel');
    assert.equal(tipoPorUrl('https://www.viajerospiratas.es/vuelos/x'), 'vuelo');
    assert.equal(tipoPorUrl('https://www.viajerospiratas.es/paquetes/x'), 'paquete');
    assert.equal(tipoPorUrl('https://www.viajerospiratas.es/viajes/x'), 'paquete');
    assert.equal(tipoPorUrl('https://www.viajerospiratas.es/vacaciones/x'), 'paquete');
    assert.equal(tipoPorUrl('https://www.viajerospiratas.es/revista-de-viajes/x'), 'escapada');
  });
});

describe('obtener', () => {
  it('descarga el feed con ctx.http y devuelve las ofertas sin reemplazar el catálogo', async () => {
    const pedidas = [];
    const ctx = {
      ...contextoFalso(),
      http: { texto: async (url) => { pedidas.push(url); return FEED; } },
    };
    const resultado = await fuente.obtener(ctx);
    assert.deepEqual(pedidas, ['https://www.viajerospiratas.es/feed']);
    assert.equal(resultado.ofertas.length, 42);
    assert.equal(resultado.reemplazar, undefined);
    assert.equal(fuente.id, 'viajerospiratas');
    assert.equal(fuente.modo, 'feed');
    assert.deepEqual(fuente.requiere, []);
  });

  it('propaga el error si la web no devuelve el feed', async () => {
    const ctx = { ...contextoFalso(), http: { texto: async () => '<html><body>Error</body></html>' } };
    await assert.rejects(fuente.obtener(ctx), /no es un feed RSS/);
  });
});
