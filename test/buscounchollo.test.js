import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import fuente, { parsear } from '../src/fuentes/buscounchollo.js';
import { validarOferta } from '../src/modelo.js';

const XML = readFileSync(new URL('./fixtures/buscounchollo-rss.xml', import.meta.url), 'utf8');

function crearCtx(respuesta = XML) {
  const registro = [];
  const peticiones = [];
  return {
    registro,
    peticiones,
    ahora: new Date('2026-09-18T08:00:00+02:00'),
    log: (mensaje) => registro.push(mensaje),
    http: {
      texto: async (url) => {
        peticiones.push(url);
        return respuesta;
      },
    },
  };
}

const ofertas = parsear(XML, crearCtx());
const oferta = (id) => ofertas.find((o) => o.id === `buscounchollo:${id}`);

describe('buscounchollo: parseo del feed', () => {
  it('convierte todas las ofertas del fixture en ofertas válidas', () => {
    assert.equal(ofertas.length, 22);
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
  });

  it('rellena los campos básicos de una escapada', () => {
    const lloret = oferta('39661');
    assert.equal(lloret.fuente, 'buscounchollo');
    assert.equal(lloret.tipo, 'escapada');
    assert.equal(lloret.titulo, '¿Una escapada a Lloret de Mar? Disfruta del Todo Incluido en hotel 3*');
    assert.equal(
      lloret.url,
      'https://www.buscounchollo.com/reserva-chollo/39661/una-escapada-a-lloret-de-mar-disfruta-del-todo-incluido-en-hotel-3',
    );
    assert.equal(lloret.imagen, 'https://content.buscounchollo.com/img/groups/39661/cover.jpg?v=1789572115');
    assert.equal(
      lloret.descripcion,
      '3 días y 2 noches en Lloret de Mar, Costa Brava, alojado en BLUESEA Copacabana 3*, en régimen de Todo incluido.',
    );
    assert.deepEqual(lloret.lugar, { nombre: 'Lloret de Mar', region: 'Girona', pais: 'España', lat: 41.7036, lon: 2.85106 });
    assert.equal(lloret.publicada, '2026-09-16T22:00:00.000Z');
    assert.equal(lloret.caduca, '2026-09-25T17:00:00.000Z');
  });

  it('ninguna URL conserva el parámetro de idioma', () => {
    for (const o of ofertas) assert.ok(!o.url.includes('_locale'), o.url);
  });

  it('limpia la descripción y la recorta a 300 caracteres', () => {
    for (const o of ofertas) assert.ok(o.descripcion.length <= 300, o.id);
    assert.match(oferta('39626').descripcion, /Hotel 4\* en el Cairo/);
    assert.ok(!oferta('39626').descripcion.includes('\\'));
    assert.match(oferta('39663').descripcion, /en Cala Millor, Mallorca, alojado/);
    assert.equal(oferta('39645').descripcion, '');
  });

  it('toma el destino del detalle cuando la dirección es «No apply»', () => {
    assert.deepEqual(oferta('39658').lugar, { nombre: 'París', region: null, pais: null, lat: null, lon: null });
    assert.equal(oferta('39626').lugar.nombre, 'Luxor · Esna · Edfu · Kom Ombo · Aswan · El Cairo');
  });
});

describe('buscounchollo: precio y unidad', () => {
  it('el precio es por persona para toda la estancia', () => {
    for (const o of ofertas) {
      assert.ok(o.precio > 0, o.id);
      assert.equal(o.unidad, 'pp');
      assert.equal(o.precioTexto, `desde ${o.precio} € por persona`);
    }
    assert.equal(oferta('39661').precio, 67);
    assert.equal(oferta('39628').precio, 19);
    assert.equal(oferta('39646').precio, 1699);
    assert.equal(oferta('39646').precioTexto, 'desde 1699 € por persona');
  });
});

describe('buscounchollo: noches', () => {
  it('usa las noches del detalle, que son las del precio', () => {
    assert.equal(oferta('39661').noches, 2);
    assert.equal(oferta('39674').noches, 1);
    assert.equal(oferta('39647').noches, 3);
    assert.equal(oferta('39646').noches, 8);
    assert.equal(oferta('39649').noches, 7);
  });

  it('sin detalle, recurre a las etiquetas de duración', () => {
    assert.equal(oferta('39645').noches, 2);
    assert.equal(oferta('39659').noches, 2);
  });
});

describe('buscounchollo: régimen', () => {
  it('prefiere el de la descripción principal aunque las etiquetas traigan varios', () => {
    assert.equal(oferta('39661').regimen, 'todo-incluido');
    assert.equal(oferta('39674').regimen, 'media-pension');
    assert.equal(oferta('39658').regimen, 'solo-alojamiento');
    assert.equal(oferta('39626').regimen, 'desayuno');
    assert.equal(oferta('39645').regimen, 'pension-completa');
    assert.equal(oferta('39628').regimen, 'desayuno');
  });

  it('lo deja vacío si no hay descripción principal y las etiquetas no coinciden', () => {
    assert.equal(oferta('39659').regimen, null);
  });
});

describe('buscounchollo: temas', () => {
  const temas = (id) => [...oferta(id).temas].sort();

  it('mapea las etiquetas a los temas del contrato', () => {
    assert.deepEqual(temas('39644'), ['familia', 'mascotas', 'rural', 'spa']);
    assert.deepEqual(temas('39639'), ['parques', 'playa']);
    assert.deepEqual(temas('39222'), ['eventos', 'parques', 'playa']);
    assert.deepEqual(temas('39586'), ['ciudad', 'parques']);
    assert.deepEqual(temas('39628'), ['romantico', 'rural']);
    assert.deepEqual(temas('39646'), ['aventura', 'playa', 'romantico']);
  });

  it('añade los temas del campo <type>', () => {
    assert.deepEqual(temas('39603'), ['gastronomia', 'romantico']);
    assert.deepEqual(temas('39387'), ['ciudad', 'gastronomia', 'mascotas', 'rural']);
  });

  it('no confunde «España» con spa ni PortAventura con aventura', () => {
    assert.ok(!oferta('39661').temas.includes('spa'));
    assert.ok(!oferta('39639').temas.includes('aventura'));
  });
});

describe('buscounchollo: transporte y tipo', () => {
  it('con vuelo incluido es un paquete en avión', () => {
    for (const id of ['39658', '39646', '39626', '39662']) {
      assert.equal(oferta(id).tipo, 'paquete', id);
      assert.equal(oferta(id).transporte, 'avion', id);
    }
  });

  it('ferry en las islas con ferry, coche por carretera y nada en las demás islas', () => {
    assert.equal(oferta('39663').transporte, 'ferry');
    assert.equal(oferta('39649').transporte, 'ferry');
    assert.equal(oferta('39661').transporte, 'coche');
    assert.equal(oferta('39647').transporte, 'coche');
    assert.equal(oferta('39655').transporte, 'coche');
    assert.equal(oferta('39607').transporte, null);
    assert.equal(oferta('39607').tipo, 'escapada');
  });
});

describe('buscounchollo: etiquetas', () => {
  it('quedan limpias y sin duplicados', () => {
    for (const o of ofertas) {
      assert.equal(new Set(o.etiquetas).size, o.etiquetas.length, o.id);
      for (const etiqueta of o.etiquetas) assert.equal(etiqueta, etiqueta.trim().replace(/,$/, ''), o.id);
    }
    assert.ok(oferta('39661').etiquetas.includes('Escapada 1-2 noches'));
  });

  it('marcan los top chollos', () => {
    assert.ok(oferta('39387').etiquetas.includes('top-chollo'));
    assert.ok(oferta('39222').etiquetas.includes('top-chollo'));
    assert.ok(!oferta('39661').etiquetas.includes('top-chollo'));
    const enFeed = XML.match(/<topChollo>Yes<\/topChollo>/g).length;
    assert.equal(ofertas.filter((o) => o.etiquetas.includes('top-chollo')).length, enFeed);
  });
});

describe('buscounchollo: errores', () => {
  it('descarta y registra solo la oferta que no cumple el contrato', () => {
    const ctx = crearCtx();
    const roto = XML.replaceAll(
      /https:\/\/www\.buscounchollo\.com\/reserva-chollo\/39661\/[^<]+/g,
      'no-es-una-url',
    );
    const resultado = parsear(roto, ctx);
    assert.equal(resultado.length, 21);
    assert.ok(!resultado.some((o) => o.id === 'buscounchollo:39661'));
    assert.equal(ctx.registro.length, 1);
    assert.match(ctx.registro[0], /^Oferta 39661 descartada: /);
  });

  it('lanza un error claro si la respuesta no es el feed', () => {
    const html = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>';
    assert.throws(() => parsear(html, crearCtx()), /no es el feed de ofertas de BuscoUnChollo/);
  });
});

describe('buscounchollo: obtener', () => {
  it('descarga el feed oficial y devuelve el catálogo completo', async () => {
    const ctx = crearCtx();
    const resultado = await fuente.obtener(ctx);
    assert.deepEqual(ctx.peticiones, ['https://www.buscounchollo.com/xml/rss.xml']);
    assert.equal(resultado.reemplazar, true);
    assert.equal(resultado.ofertas.length, 22);
  });

  it('falla si el feed no trae ofertas', async () => {
    const vacio = '<?xml version="1.0" encoding="UTF-8"?><listings><title>Busco un chollo</title></listings>';
    await assert.rejects(fuente.obtener(crearCtx(vacio)), /no trae ninguna oferta/);
  });

  it('declara los metadatos de la fuente', () => {
    assert.equal(fuente.id, 'buscounchollo');
    assert.equal(fuente.modo, 'feed');
    assert.equal(fuente.web, 'https://www.buscounchollo.com');
    assert.deepEqual(fuente.requiere, []);
  });
});
