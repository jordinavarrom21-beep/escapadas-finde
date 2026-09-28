import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { parsear, toursDe } from '../src/fuentes/guruwalk.js';
import { fusionar } from '../src/almacen.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { AHORA, crearCtx, leerFixture, oferta } from './ayudas.js';

const PAGINAS = {
  barcelona: leerFixture('guruwalk-barcelona.html'),
  girona: leerFixture('guruwalk-girona.html'),
  tarragona: leerFixture('guruwalk-tarragona.html'),
  sitges: leerFixture('guruwalk-sitges.html'),
};
const SLUGS = ['barcelona', 'girona', 'tarragona', 'sitges'];

/** Ciudad tal como la recibe `parsear` (la fuente la saca de su lista interna). */
const CIUDAD = {
  barcelona: { slug: 'barcelona', nombre: 'Barcelona', region: 'Barcelona', lat: 41.3851, lon: 2.1734 },
  girona: { slug: 'girona', nombre: 'Girona', region: 'Girona', lat: 41.9794, lon: 2.8214 },
  tarragona: { slug: 'tarragona', nombre: 'Tarragona', region: 'Tarragona', lat: 41.1189, lon: 1.2445 },
  sitges: { slug: 'sitges', nombre: 'Sitges', region: 'Barcelona', lat: 41.2372, lon: 1.8059 },
};

/** Ids de tour de las URLs `/es/walks/<id>-…` de cada fixture, en el orden de la página (contados a mano). */
const TOURS = {
  barcelona: ['564', '574', '38018', '38016', '45042', '64569', '45774', '67743', '41570', '38229'],
  girona: ['31351', '33244', '65878', '56540', '70010', '66540', '71970', '12761'],
  tarragona: ['68241', '46577', '68634', '68928', '47238', '72367', '33660'],
  sitges: ['65016'],
};

/**
 * Bloques JSON-LD de una página, leídos aquí por separado (sin cheerio ni la
 * fuente) para contrastar lo que sale de `parsear` con lo que dice la página.
 */
function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap(([, json]) => [JSON.parse(json)].flat());
}
const eventosDe = (html) => jsonLd(html).filter((bloque) => bloque['@type'] === 'Event');
const bloqueDe = (html, tipo) => jsonLd(html).find((bloque) => bloque['@type'] === tipo);

/** Página mínima con los bloques JSON-LD indicados. */
const pagina = (...bloques) => `<!DOCTYPE html><html><head>${bloques
  .map((bloque) => `<script type="application/ld+json">${JSON.stringify(bloque)}</script>`)
  .join('\n')}</head><body></body></html>`;

/** El único tour real de Sitges, con los cambios indicados. */
const [TOUR_SITGES] = eventosDe(PAGINAS.sitges);
const tour = (cambios = {}) => ({ ...structuredClone(TOUR_SITGES), ...cambios });
const unaOferta = (evento, ctx = {}) => parsear(pagina([evento]), ctx, CIUDAD.sitges);

const porId = (ofertas, id) => ofertas.find((o) => o.id === `guruwalk:${id}`);

/** Red simulada: cada URL de ciudad devuelve su fixture, salvo los `cambios` (por slug). */
function respuestas(cambios = {}) {
  return (url) => {
    const slug = new URL(url).pathname.split('/').pop();
    const respuesta = slug in cambios ? cambios[slug] : PAGINAS[slug];
    if (respuesta instanceof Error) throw respuesta;
    if (!respuesta) throw new Error(`url inesperada: ${url}`);
    return respuesta;
  };
}
const urlDe = (slug) => `https://www.guruwalk.com/es/${slug}`;

describe('guruwalk: parsear (páginas reales)', () => {
  for (const slug of SLUGS) {
    it(`${slug}: un tour gratis por persona por cada Event de la página, con id estable y único`, () => {
      const { ctx, logs } = crearCtx();
      const ofertas = parsear(PAGINAS[slug], ctx, CIUDAD[slug]);
      assert.deepEqual(logs, []);

      assert.equal(ofertas.length, (PAGINAS[slug].match(/"@type":"Event"/g) ?? []).length, 'un tour por cada Event');
      assert.deepEqual(ofertas.map((o) => o.id), TOURS[slug].map((id) => `guruwalk:${slug}:${id}`));
      assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length, 'ids únicos');
      assert.deepEqual(parsear(PAGINAS[slug], {}, CIUDAD[slug]).map((o) => o.id), ofertas.map((o) => o.id), 'mismos ids en otra lectura');

      // La propia página dice que todos sus tours valen 0 € (rango de precios 0–0 en euros).
      const resumen = bloqueDe(PAGINAS[slug], 'Product').offers;
      assert.deepEqual([resumen.lowPrice, resumen.highPrice, resumen.priceCurrency], [0, 0, 'EUR']);

      for (const o of ofertas) {
        assert.deepEqual(validarOferta(o), [], o.id);
        assert.equal(o.fuente, 'guruwalk');
        assert.equal(o.tipo, 'actividad');
        assert.equal(o.precio, 0, o.id);
        assert.equal(o.unidad, 'pp', 'la plaza y la propina son por persona');
        assert.equal(o.precioTexto, 'Gratis (propina voluntaria)');
        assert.deepEqual(o.etiquetas, ['Free tour', 'gratis']);
        assert.deepEqual(o.temas, ['ciudad']);
        assert.deepEqual(o.fechas, { salida: null, vuelta: null, findeId: null, puenteId: null }, 'un free tour no tiene fechas');
        assert.deepEqual(o.lugar, {
          nombre: CIUDAD[slug].nombre, region: CIUDAD[slug].region, pais: 'España', codigoPais: 'ES',
          lat: CIUDAD[slug].lat, lon: CIUDAD[slug].lon, iata: null,
        });
      }
    });
  }

  it('título, URL, imagen, descripción y valoración coinciden con el JSON-LD de cada tour', () => {
    for (const slug of SLUGS) {
      const ofertas = parsear(PAGINAS[slug], {}, CIUDAD[slug]);
      eventosDe(PAGINAS[slug]).forEach((evento, i) => {
        const o = ofertas[i];
        assert.equal(o.titulo, evento.name.trim(), o.id);
        assert.equal(o.url, evento.url, 'las URLs de la página ya vienen limpias');
        assert.equal(o.imagen, evento.image);
        assert.match(o.url, /^https:\/\/www\.guruwalk\.com\/es\/walks\/\d+-[a-z0-9-]+$/, 'absoluta y sin parámetros');
        assert.match(o.imagen, /^https:\/\/media\.guruwalk\.com\/[a-z0-9]+$/);
        assert.ok(o.descripcion.length > 0 && o.descripcion.length <= 300, o.id);
        assert.doesNotMatch(o.descripcion, /[<>]|&[#a-z\d]+;?/i, `${o.id}: descripción en texto plano, sin entidades`);
      });
    }
  });

  it('el tour más popular de Barcelona (564) con sus datos exactos', () => {
    const o = porId(parsear(PAGINAS.barcelona, {}, CIUDAD.barcelona), 'barcelona:564');
    assert.equal(o.titulo, 'Free Tour por el Casco Antiguo de Barcelona (Barrio Gótico y el Borne)', 'sin el espacio final de la web');
    assert.equal(o.url, 'https://www.guruwalk.com/es/walks/564-free-tour-por-el-casco-antiguo-de-barcelona-barrio-gotico-y-el-borne');
    assert.equal(o.imagen, 'https://media.guruwalk.com/ljj4n6jk188dqxgojzyc7tdb2bnd');
    assert.match(o.descripcion, /^Descubre el tour más popular de la última década: el mejor valorado/);
    assert.deepEqual(o.valoracion, { nota: 9.8, n: 14742 }, '4,89 sobre 5 son 9,8 sobre 10');
  });

  it('pasa la valoración de 5 a 10 estrellas y la deja en null si el tour no tiene opiniones', () => {
    const tarragona = parsear(PAGINAS.tarragona, {}, CIUDAD.tarragona);
    assert.deepEqual(porId(tarragona, 'tarragona:72367').valoracion, { nota: 8.8, n: 5 }, '4,4 sobre 5');
    assert.deepEqual(porId(tarragona, 'tarragona:33660').valoracion, { nota: 9.4, n: 369 }, '4,71 sobre 5');
    assert.deepEqual(porId(parsear(PAGINAS.sitges, {}, CIUDAD.sitges), 'sitges:65016').valoracion, { nota: 10, n: 1 });
    const girona = parsear(PAGINAS.girona, {}, CIUDAD.girona);
    // Los cuatro últimos tours de Girona no traen «aggregateRating» en la página.
    for (const id of ['70010', '66540', '71970', '12761']) assert.equal(porId(girona, `girona:${id}`).valoracion, null, id);
    assert.deepEqual(porId(girona, 'girona:31351').valoracion, { nota: 9.5, n: 2820 });
  });

  it('decodifica las entidades de la web (&nbsp;) y respeta comillas y espacios del título', () => {
    const barcelona = parsear(PAGINAS.barcelona, {}, CIUDAD.barcelona);
    // En la página: «Reserva&nbsp; el tour más recomendado, con más de 18,000 reseñas … Google maps!&nbsp;El Tour de Gaudí…».
    assert.match(porId(barcelona, 'barcelona:38018').descripcion,
      /^Reserva el tour más recomendado, con más de 18,000 reseñas de 5 estrellas en Google maps! El Tour de Gaudí es el tour estrella/);
    // En la página empieza por «&nbsp;Te invitamos…».
    assert.match(porId(barcelona, 'barcelona:45042').descripcion, /^Te invitamos a conocer una conjunción perfecta/);
    const tarragona = porId(parsear(PAGINAS.tarragona, {}, CIUDAD.tarragona), 'tarragona:68928');
    assert.equal(tarragona.titulo,
      'Tarragona Historica "Más de 2.000 años de historias" . (Teatralizado por guía local y el más original de Cataluña)');
  });

  it('no deja restos de una entidad que la web corta al acortar la descripción («&nb...»)', () => {
    // En la página, la descripción del tour 56540 termina en «…la comunidad judía.&nb...».
    assert.match(eventosDe(PAGINAS.girona)[3].description, /judía\.&nb\.\.\.$/);
    const o = porId(parsear(PAGINAS.girona, {}, CIUDAD.girona), 'girona:56540');
    assert.match(o.descripcion, /^El Free Tour de Girona es la manera ideal de conocer los rincones más emblemáticos/);
    assert.match(o.descripcion, /la huella que dejó la comunidad judía\.\.\.\.$/);
    assert.doesNotMatch(o.descripcion, /&/);
  });

  it('solo quita la entidad cortada del final, no un «&» normal del texto', () => {
    for (const descripcion of ['Ruta de tapas por Gràcia&Bar', 'Rock&Roll en el Born, 2 horas', 'Tour R&B']) {
      assert.equal(unaOferta(tour({ description: descripcion }))[0].descripcion, descripcion);
    }
  });
});

describe('guruwalk: casos límite', () => {
  it('página vacía o sin tours: error claro, que no es un bloqueo', () => {
    assert.throws(() => toursDe(''), (error) => /ningún tour en JSON-LD/.test(error.message) && !error.bloqueo);
    // La página real de Sitges sin su bloque de tours: quedan WebPage, FAQ, Product, Place…
    const sinTours = PAGINAS.sitges.replace(/<script type="application\/ld\+json">\[\{"@context":"https:\/\/schema\.org","@type":"Event"[\s\S]*?<\/script>/, '');
    assert.ok(jsonLd(sinTours).length >= 5 && !eventosDe(sinTours).length);
    assert.throws(() => parsear(sinTours, {}, CIUDAD.sitges), (error) => /ningún tour/.test(error.message) && !error.bloqueo);
  });

  it('un desafío anti-bot lanza un error marcado como bloqueo', () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget"></div></body></html>';
    assert.throws(() => parsear(desafio, {}, CIUDAD.barcelona), (error) => /desafío anti-bot/.test(error.message) && error.bloqueo === true);
  });

  it('un bloque JSON-LD roto no impide leer los demás', () => {
    const conRoto = PAGINAS.sitges.replace('<head>', '<head><script type="application/ld+json">{"@type":"Event",</script>');
    assert.deepEqual(parsear(conRoto, {}, CIUDAD.sitges).map((o) => o.id), ['guruwalk:sitges:65016']);
  });

  it('un tour sin precio queda sin precio, sin unidad y sin «gratis» (no como gratis)', () => {
    const sinOferta = tour();
    delete sinOferta.offers;
    const variantes = {
      'sin offers': sinOferta,
      'price null': tour({ offers: { ...TOUR_SITGES.offers, price: null } }),
      'price vacío': tour({ offers: { ...TOUR_SITGES.offers, price: '' } }),
      'price no numérico': tour({ offers: { ...TOUR_SITGES.offers, price: 'Consultar' } }),
    };
    for (const [caso, evento] of Object.entries(variantes)) {
      const [o] = unaOferta(evento);
      assert.deepEqual(validarOferta(o), [], caso);
      assert.equal(o.precio, null, caso);
      assert.equal(o.unidad, null, caso);
      assert.equal(o.precioTexto, '', caso);
      assert.deepEqual(o.etiquetas, ['Free tour'], caso);
    }
  });

  it('precio 0 (también en texto) es gratis; en otra moneda no se acepta; si algún día cobra, va por persona sin «gratis»', () => {
    const [gratisTexto] = unaOferta(tour({ offers: { ...TOUR_SITGES.offers, price: '0.00' } }));
    assert.equal(gratisTexto.precio, 0);
    assert.equal(gratisTexto.precioTexto, 'Gratis (propina voluntaria)');

    const [dolares] = unaOferta(tour({ offers: { ...TOUR_SITGES.offers, price: 0, priceCurrency: 'USD' } }));
    assert.equal(dolares.precio, null);
    assert.equal(dolares.unidad, null);
    assert.deepEqual(dolares.etiquetas, ['Free tour']);

    const [negativo] = unaOferta(tour({ offers: { ...TOUR_SITGES.offers, price: -5 } }));
    assert.equal(negativo.precio, null);

    const [dePago] = unaOferta(tour({ offers: { ...TOUR_SITGES.offers, price: 15 } }));
    assert.deepEqual(validarOferta(dePago), []);
    assert.equal(dePago.precio, 15);
    assert.equal(dePago.unidad, 'pp');
    assert.doesNotMatch(dePago.precioTexto, /gratis/i);
    assert.deepEqual(dePago.etiquetas, ['Free tour']);
  });

  it('quita HTML y entidades del título y la descripción, y recorta la descripción larga', () => {
    const [o] = unaOferta(tour({
      name: ' Free tour &amp; tapas <b>por el Born</b> ',
      description: `<p>Paseo&nbsp;por el Born&#8230;</p><p>${'y sus calles con historia '.repeat(20)}</p>`,
    }));
    assert.equal(o.titulo, 'Free tour & tapas por el Born');
    assert.match(o.descripcion, /^Paseo por el Born… y sus calles con historia y sus calles/);
    assert.ok(o.descripcion.length <= 300, `${o.descripcion.length} caracteres`);
    assert.match(o.descripcion, /…$/);
    assert.doesNotMatch(o.descripcion, /[<>]|&nbsp;|&#/);
  });

  it('el id sale del número del tour: no cambia con el título, los parámetros ni el orden', () => {
    const [renombrado] = unaOferta(tour({
      url: 'https://www.guruwalk.com/es/walks/65016-nuevo-nombre-del-tour?utm_source=newsletter&utm_medium=email&ref=home#opiniones',
    }));
    assert.equal(renombrado.id, 'guruwalk:sitges:65016');
    assert.equal(renombrado.url, 'https://www.guruwalk.com/es/walks/65016-nuevo-nombre-del-tour', 'sin parámetros de seguimiento');

    const [relativo] = unaOferta(tour({ url: '/es/walks/65016-caminos-de-memoria-y-cultura-en-sitges', image: '/uploads/tours/65016.jpg' }));
    assert.equal(relativo.id, 'guruwalk:sitges:65016');
    assert.equal(relativo.url, 'https://www.guruwalk.com/es/walks/65016-caminos-de-memoria-y-cultura-en-sitges');
    assert.equal(relativo.imagen, 'https://www.guruwalk.com/uploads/tours/65016.jpg', 'imagen absoluta');

    const [sinImagen] = unaOferta(tour({ image: undefined }));
    assert.equal(sinImagen.imagen, null);

    const eventos = eventosDe(PAGINAS.barcelona);
    const alReves = parsear(pagina([...eventos].reverse()), {}, CIUDAD.barcelona).map((o) => o.id);
    assert.deepEqual(alReves, TOURS.barcelona.map((id) => `guruwalk:barcelona:${id}`).reverse());
  });

  it('descarta el tour sin URL de tour reconocible, lo registra y sigue con los demás', () => {
    const { ctx, logs } = crearCtx();
    const sinUrl = tour({ url: undefined });
    const deCiudad = tour({ url: 'https://www.guruwalk.com/es/sitges' });
    const bueno = eventosDe(PAGINAS.barcelona)[0];
    const ofertas = parsear(pagina([sinUrl, deCiudad, bueno]), ctx, CIUDAD.sitges);
    assert.deepEqual(ofertas.map((o) => o.id), ['guruwalk:sitges:564']);
    assert.equal(logs.length, 2);
    assert.match(logs[0], /^Tour descartado \(Caminos de Memoria y Cultura en Sitges\): URL de tour no reconocida: undefined$/);
    assert.match(logs[1], /URL de tour no reconocida: https:\/\/www\.guruwalk\.com\/es\/sitges$/);
  });
});

describe('guruwalk: obtener', () => {
  it('pide las 4 ciudades en orden, con 2 s de pausa y sin reintentos', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: respuestas() });
    const opciones = [];
    const pedir = ctx.http.texto;
    ctx.http.texto = (url, opcion) => {
      opciones.push(opcion);
      return pedir(url);
    };
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(fuente.urls, SLUGS.map(urlDe));
    assert.deepEqual(peticiones, fuente.urls);
    assert.deepEqual(esperas, [2000, 2000, 2000]);
    assert.deepEqual(opciones, SLUGS.map(() => ({ reintentos: 0 })), 'ante un 429 no se reintenta');
    assert.equal(ofertas.length, 10 + 8 + 7 + 1);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length, 'ids únicos');
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
    for (const slug of SLUGS) assert.ok(reemplazar({ id: `guruwalk:${slug}:1` }), slug);
  });

  it('cada tour lleva el nombre y las coordenadas de su ciudad, que coinciden con las de la página', async () => {
    const { ctx } = crearCtx({ respuestas: respuestas() });
    const { ofertas } = await fuente.obtener(ctx);
    const regiones = { barcelona: 'Barcelona', girona: 'Girona', tarragona: 'Tarragona', sitges: 'Barcelona' };
    for (const slug of SLUGS) {
      const lugar = bloqueDe(PAGINAS[slug], 'Place');
      const deCiudad = ofertas.filter((o) => o.id.startsWith(`guruwalk:${slug}:`));
      assert.equal(deCiudad.length, TOURS[slug].length, slug);
      for (const o of deCiudad) {
        assert.equal(o.lugar.nombre, lugar.name, o.id);
        assert.equal(o.lugar.region, regiones[slug], 'provincia');
        assert.equal(o.lugar.pais, 'España');
        assert.equal(o.lugar.codigoPais, 'ES');
        assert.ok(Math.abs(o.lugar.lat - Number(lugar.geo.latitude)) < 0.001, `${o.id}: latitud ${o.lugar.lat}`);
        assert.ok(Math.abs(o.lugar.lon - Number(lugar.geo.longitude)) < 0.001, `${o.id}: longitud ${o.lugar.lon}`);
      }
    }
  });

  it('si una ciudad da HTTP 500, devuelve las demás', async () => {
    const rota = urlDe('tarragona');
    const { ctx, peticiones, logs } = crearCtx({ respuestas: respuestas({ tarragona: new ErrorHttp(500, rota) }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 4);
    assert.equal(ofertas.length, 10 + 8 + 1);
    assert.ok(!ofertas.some((o) => o.id.startsWith('guruwalk:tarragona:')));
    assert.ok(logs.some((l) => l.startsWith(`${rota}: HTTP 500`)), logs.join('\n'));
  });

  it('reemplazar solo borra ofertas de las ciudades leídas bien en esta ejecución', async () => {
    const { ctx } = crearCtx({ respuestas: respuestas({ tarragona: new ErrorHttp(500, urlDe('tarragona')) }) });
    const resultado = await fuente.obtener(ctx);
    const { reemplazar } = resultado;
    assert.ok(reemplazar({ id: 'guruwalk:barcelona:564' }));
    assert.ok(reemplazar({ id: 'guruwalk:girona:31351' }));
    assert.ok(reemplazar({ id: 'guruwalk:sitges:65016' }));
    assert.ok(!reemplazar({ id: 'guruwalk:tarragona:68241' }), 'Tarragona ha fallado: se conserva lo guardado');
    assert.ok(!reemplazar({ id: 'guruwalk:madrid:1' }), 'una ciudad que no se pide');

    // Aplicado al almacén: se va el tour que ha desaparecido de Barcelona y se quedan los de Tarragona.
    const estado = { ofertas: {} };
    for (const id of ['guruwalk:barcelona:1', 'guruwalk:barcelona:564', 'guruwalk:tarragona:68241']) {
      estado.ofertas[id] = oferta({ fuente: 'guruwalk', id });
    }
    estado.ofertas['civitatis:barcelona:x'] = oferta({ fuente: 'civitatis', id: 'civitatis:barcelona:x' });
    const { borradas } = fusionar(estado, 'guruwalk', resultado, AHORA);
    assert.equal(borradas, 1);
    assert.ok(!estado.ofertas['guruwalk:barcelona:1']);
    assert.ok(estado.ofertas['guruwalk:tarragona:68241']);
    assert.ok(estado.ofertas['civitatis:barcelona:x']);
    assert.equal(estado.ofertas['guruwalk:barcelona:564'].titulo, 'Free Tour por el Casco Antiguo de Barcelona (Barrio Gótico y el Borne)');
  });

  it('una ciudad cuyos tours no se entienden no cuenta como leída y no borra lo guardado', async () => {
    // Si GuruWalk cambiara la forma de sus URLs, todos los tours de la página se descartarían.
    const gironaCambiada = PAGINAS.girona.replaceAll('/es/walks/', '/es/experiencias/');
    assert.equal(eventosDe(gironaCambiada).length, 8);
    const { ctx, logs } = crearCtx({ respuestas: respuestas({ girona: gironaCambiada }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(ofertas.length, 10 + 7 + 1);
    assert.equal(logs.filter((l) => l.startsWith('Tour descartado')).length, 8);
    assert.ok(logs.some((l) => l.startsWith(`${urlDe('girona')}: `)), 'se registra el fallo de la ciudad');
    assert.ok(!reemplazar({ id: 'guruwalk:girona:31351' }), 'no se borran los tours guardados de Girona');
    assert.ok(reemplazar({ id: 'guruwalk:barcelona:564' }));

    const todasCambiadas = Object.fromEntries(SLUGS.map((slug) => [slug, PAGINAS[slug].replaceAll('/es/walks/', '/es/experiencias/')]));
    const { ctx: ctxTodas } = crearCtx({ respuestas: respuestas(todasCambiadas) });
    await assert.rejects(fuente.obtener(ctxTodas), /No se ha podido leer ninguna ciudad de GuruWalk/);
  });

  it('un tour que sale en dos páginas (o dos veces en la misma) se queda una sola vez, con la primera ciudad', async () => {
    const [casco] = eventosDe(PAGINAS.barcelona);
    const barcelonaRepetido = PAGINAS.barcelona.replace('</head>', `${pagina([casco]).match(/<script[\s\S]*<\/script>/)[0]}</head>`);
    const sitgesConCasco = PAGINAS.sitges.replace('</head>', `${pagina([casco]).match(/<script[\s\S]*<\/script>/)[0]}</head>`);
    assert.equal(eventosDe(barcelonaRepetido).length, 11);
    assert.equal(eventosDe(sitgesConCasco).length, 2);
    const { ctx } = crearCtx({ respuestas: respuestas({ barcelona: barcelonaRepetido, sitges: sitgesConCasco }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    const ids = ofertas.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, `ids repetidos: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
    assert.equal(ofertas.length, 26);
    const casco564 = ofertas.filter((o) => o.url.includes('/walks/564-'));
    assert.deepEqual(casco564.map((o) => o.id), ['guruwalk:barcelona:564']);
    assert.equal(casco564[0].lugar.nombre, 'Barcelona');
    assert.ok(reemplazar({ id: 'guruwalk:sitges:564' }), 'la copia de Sitges que hubiera guardada se puede borrar');
  });

  it('ante un 403 deja de pedir y devuelve lo leído', async () => {
    const bloqueada = urlDe('girona');
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: respuestas({ girona: new ErrorHttp(403, bloqueada) }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, [urlDe('barcelona'), bloqueada]);
    assert.deepEqual(esperas, [2000]);
    assert.equal(ofertas.length, 10);
    assert.ok(logs.some((l) => l.includes('HTTP 403')));
    assert.ok(logs.some((l) => l.includes('bloqueado o limitado')));
    assert.ok(reemplazar({ id: 'guruwalk:barcelona:564' }));
    for (const slug of ['girona', 'tarragona', 'sitges']) assert.ok(!reemplazar({ id: `guruwalk:${slug}:1` }), slug);
  });

  it('ante un 429 también deja de pedir', async () => {
    const limitada = urlDe('tarragona');
    const { ctx, peticiones } = crearCtx({ respuestas: respuestas({ tarragona: new ErrorHttp(429, limitada) }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, [urlDe('barcelona'), urlDe('girona'), limitada]);
    assert.equal(ofertas.length, 10 + 8);
  });

  it('un desafío anti-bot en la primera ciudad corta y lanza un error claro', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget"></div></body></html>';
    const { ctx, peticiones } = crearCtx({ respuestas: respuestas({ barcelona: desafio }) });
    await assert.rejects(fuente.obtener(ctx), /No se ha podido leer ninguna ciudad de GuruWalk \(último error: GuruWalk ha devuelto un desafío anti-bot\)/);
    assert.equal(peticiones.length, 1);
  });

  it('si fallan todas las ciudades, lanza un error claro con el último fallo', async () => {
    const todasRotas = Object.fromEntries(SLUGS.map((slug) => [slug, new ErrorHttp(500, urlDe(slug))]));
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: respuestas(todasRotas) });
    await assert.rejects(fuente.obtener(ctx), /^Error: No se ha podido leer ninguna ciudad de GuruWalk \(último error: HTTP 500 en www\.guruwalk\.com\)$/);
    assert.equal(peticiones.length, 4);
    assert.deepEqual(esperas, [2000, 2000, 2000]);
  });
});

describe('guruwalk: robots.txt', () => {
  const robots = leerFixture('guruwalk-robots.txt');

  it('permite todas las URLs que declara la fuente', () => {
    assert.equal(fuente.urls.length, 4);
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.ok(rutaPermitida(robots, `${pathname}${search}`), url);
    }
  });

  it('prohíbe la API, la búsqueda y las opiniones, que la fuente no pide', () => {
    for (const ruta of [
      '/es/api/v1/walks?city=barcelona',
      '/es/search',
      '/es/search?q=barcelona',
      '/es/walks/564-free-tour-por-el-casco-antiguo-de-barcelona-barrio-gotico-y-el-borne/reviews',
      '/es/barcelona?begins_at=2026-10-03',
      '/es/tours?city=barcelona',
    ]) {
      assert.ok(!rutaPermitida(robots, ruta), ruta);
      assert.ok(!fuente.urls.some((url) => new URL(url).pathname.startsWith(ruta.split('?')[0]) && ruta.includes('?') === url.includes('?')), ruta);
    }
  });
});
