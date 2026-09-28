import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { parsear, precioDe } from '../src/fuentes/tuscasasrurales.js';
import { estadoInicial, fusionar } from '../src/almacen.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { AHORA, crearCtx, leerFixture } from './ayudas.js';

const BARCELONA = leerFixture('tuscasasrurales-barcelona.html');
const GIRONA = leerFixture('tuscasasrurales-girona.html');
const PIRINEO = leerFixture('tuscasasrurales-pirineo.html');
const WEB = 'https://www.tuscasasrurales.com';
const [URL_BARCELONA, URL_GIRONA, URL_LLEIDA] = fuente.urls;
const DESAFIO = '<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget"></div></body></html>';
const SIN_TARJETAS = '<html><body><h1>Casas rurales</h1><section class="listado-fichas"></section></body></html>';

/** Red simulada: la respuesta i-ésima es la de fuente.urls[i] (un Error se lanza). */
function red(respuestas) {
  return (url) => {
    const i = fuente.urls.indexOf(url);
    if (i < 0) throw new Error(`url inesperada: ${url}`);
    if (respuestas[i] instanceof Error) throw respuestas[i];
    return respuestas[i];
  };
}
/**
 * Las tres páginas con fixture en su URL; Lleida, Tarragona y Montseny repiten una de
 * ellas, así que las 120 tarjetas son solo 44 casas distintas (20 + 20 + 4 nuevas del Pirineo).
 */
const TODAS = [BARCELONA, GIRONA, PIRINEO, BARCELONA, PIRINEO, GIRONA];

/** El <article> real de una casa, para montar variantes sobre HTML verdadero. */
function tarjeta(html, id) {
  const inicio = html.indexOf(`data-id="${id}"`);
  assert.ok(inicio > 0, `no está la casa ${id}`);
  return html.slice(html.lastIndexOf('<article', inicio), html.indexOf('</article>', inicio) + '</article>'.length);
}
const pagina = (...tarjetas) => `<html><body><section class="listado-fichas">${tarjetas.join('\n')}</section></body></html>`;
const conPrecio = (html, precio, unidad = 'persona/noche') => html
  .replace(/<div class="ficha-precio">[^<]*<\/div>/, `<div class="ficha-precio">${precio}</div>`)
  .replace(/<div class="ficha-pers-noche">[^<]*<\/div>/, unidad === null ? '' : `<div class="ficha-pers-noche">${unidad}</div>`);
const conParrafo = (html, texto) => html.replace(/<p class="ficha-parrafo">[\s\S]*?<\/p>/, `<p class="ficha-parrafo">${texto}</p>`);

const porId = (ofertas, id) => ofertas.find((o) => o.id === `tuscasasrurales:${id}`);
const unica = (html) => {
  const ofertas = parsear(html);
  assert.equal(ofertas.length, 1);
  return ofertas[0];
};

/** Lo que dice el HTML, leído con expresiones regulares y no con el parser de la fuente. */
function segunElHtml(html) {
  const enlaces = [...html.matchAll(/<h3 class="ficha-titulo"><a href="([^"]+)" title="[^"]*" target="_blank">([^<]+)<\/a><\/h3>/g)];
  return {
    ids: [...html.matchAll(/<article class="cont-gr-ficha" data-nombreurl="[^"]*" data-id="(\d+)">/g)].map((m) => m[1]),
    urls: enlaces.map((m) => m[1]),
    titulos: enlaces.map((m) => m[2]),
    provincias: [...html.matchAll(/<p class="ficha-provincia">([^<]+)<\/p>/g)].map((m) => m[1]),
    // Cada precio va seguido de su unidad: «Desde 30€» + «persona/noche».
    precios: [...html.matchAll(/<div class="ficha-precio">Desde (\d+)€<\/div>\s*<div class="ficha-pers-noche">persona\/noche<\/div>/g)]
      .map((m) => Number(m[1])),
  };
}

describe('tuscasasrurales: parsear (páginas reales)', () => {
  for (const [nombre, html] of [['Barcelona', BARCELONA], ['Girona', GIRONA], ['Pirineo catalán', PIRINEO]]) {
    it(`convierte las 20 tarjetas de ${nombre} en casas rurales válidas, con lo que pone la página`, () => {
      const { ctx, logs } = crearCtx();
      const ofertas = parsear(html, ctx);
      const pagina = segunElHtml(html);
      assert.equal(ofertas.length, 20);
      assert.deepEqual(logs, []);
      assert.equal(new Set(ofertas.map((o) => o.id)).size, 20, 'ids únicos');
      assert.deepEqual(ofertas.map((o) => o.id), pagina.ids.map((id) => `tuscasasrurales:${id}`));
      assert.deepEqual(ofertas.map((o) => o.url), pagina.urls);
      assert.deepEqual(ofertas.map((o) => o.titulo), pagina.titulos);
      assert.deepEqual(ofertas.map((o) => o.lugar.region), pagina.provincias);
      assert.equal(pagina.precios.length, 20, 'las 20 tarjetas anuncian «Desde N€ persona/noche»');
      assert.deepEqual(ofertas.map((o) => o.precio), pagina.precios);

      for (const o of ofertas) {
        assert.deepEqual(validarOferta(o), [], o.id);
        const num = o.id.split(':')[1];
        assert.equal(o.fuente, 'tuscasasrurales');
        assert.equal(o.tipo, 'hotel');
        assert.equal(o.alojamiento, 'casa-rural');
        assert.deepEqual(o.temas, ['rural']);
        assert.equal(o.regimen, 'solo-alojamiento', 'todas son «Alquiler íntegro»');
        assert.equal(o.unidad, 'pp/noche', 'la tarjeta dice «persona/noche»');
        assert.equal(o.precioTexto, `desde ${o.precio} € por persona y noche`);
        // La ficha de la casa, sin parámetros: el número es el mismo que el data-id.
        assert.match(o.url, new RegExp(`^${WEB}/[a-z0-9-]+-f${num}\\.htm$`));
        assert.equal(new URL(o.url).search, '');
        assert.match(o.imagen, new RegExp(`^${WEB}/imagenes/galeria/${num}_g\\d+/ico_${num}\\.jpg$`));
        assert.ok(o.descripcion.length > 0 && o.descripcion.length <= 300, o.id);
        assert.doesNotMatch(o.descripcion, /<|>|\s{2}|&nbsp;/);
        assert.equal(o.lugar.pais, 'España');
        assert.equal(o.lugar.codigoPais, 'ES');
        assert.ok(o.lugar.nombre && !o.lugar.nombre.includes('('), o.lugar.nombre);
        // El listado no trae coordenadas: las pone geo.js a partir del municipio.
        assert.equal(o.lugar.lat, null);
        assert.equal(o.lugar.lon, null);
        assert.equal(o.fechas.salida, null);
        assert.equal(o.publicada, null);
        assert.equal(o.caduca, null);
      }
    });
  }

  it('rellena todos los campos de El Pla de Besora como los enseña su tarjeta', () => {
    const casa = porId(parsear(BARCELONA), '15573');
    assert.equal(casa.titulo, 'El Pla de Besora');
    assert.equal(casa.url, `${WEB}/el-pla-de-besora-f15573.htm`);
    assert.equal(casa.imagen, `${WEB}/imagenes/galeria/15573_g63/ico_15573.jpg`, 'la ruta relativa se hace absoluta');
    assert.equal(casa.precio, 30);
    assert.equal(casa.unidad, 'pp/noche');
    assert.equal(casa.precioTexto, 'desde 30 € por persona y noche');
    assert.equal(casa.descripcion, 'El Pla de Besora es un acogedor alojamiento rural situado en Santa María de Besora, un bonito pueblo de montaña del valle del Bisaura, Barcelona. Esta antigua masía está totalmente equipada y cuenta con una sala de juegos, jardín y barbacoa');
    assert.deepEqual(casa.lugar, { nombre: 'Santa Maria de Besora', region: 'Barcelona', pais: 'España', codigoPais: 'ES', lat: null, lon: null });
    assert.deepEqual(casa.valoracion, { nota: 10, n: 1 });
    assert.deepEqual(casa.etiquetas, ['Casa rural', 'Alquiler íntegro', '12 - 16 personas', '6 dormitorios', '11 camas', '3 baños']);
  });

  it('lee la nota con coma decimal y el número de opiniones, y deja sin valoración la casa que no tiene', () => {
    const barcelona = parsear(BARCELONA);
    assert.deepEqual(porId(barcelona, '24600').valoracion, { nota: 9.9, n: 34 }, 'Cal Gorguixé: «9,9 · 34 opiniones»');
    assert.deepEqual(porId(barcelona, '21400').valoracion, { nota: 9, n: 4 }, 'Ca L´avi: «9,0 · 4 opiniones»');
    assert.equal(porId(barcelona, '10149').valoracion, null, 'Baumala no enseña nota');
    // 12 de las 20 tarjetas de Barcelona traen nota.
    assert.equal(barcelona.filter((o) => o.valoracion).length, 12);
  });

  it('quita la comarca del municipio y conserva el tipo de alquiler en las etiquetas', () => {
    const baumala = porId(parsear(BARCELONA), '10149');
    assert.deepEqual([baumala.lugar.nombre, baumala.lugar.region], ['Borreda', 'Barcelona'], '«Borreda (Berguedá)»');
    const sansalvador = porId(parsear(BARCELONA), '18107');
    assert.equal(sansalvador.regimen, 'solo-alojamiento');
    assert.ok(sansalvador.etiquetas.includes('Alquiler íntegro (4 uds. de alquiler)'));
    const gimbernat = porId(parsear(GIRONA), '25444');
    assert.equal(gimbernat.precio, 60);
    assert.deepEqual([gimbernat.lugar.nombre, gimbernat.lugar.region], ['Santa Cristina d Aro', 'Girona']);
    assert.equal(porId(parsear(GIRONA), '11102').titulo, 'Mas Ca l`Estrada');
  });

  it('en la página del Pirineo cada casa lleva su provincia y el texto sin etiquetas HTML', () => {
    const pirineo = parsear(PIRINEO);
    const pirineuRural = porId(pirineo, '19005');
    assert.deepEqual([pirineuRural.lugar.nombre, pirineuRural.lugar.region], ['Coll de Nargo', 'Lleida']);
    assert.equal(pirineuRural.precio, 27);
    assert.deepEqual(pirineuRural.valoracion, { nota: 10, n: 20 });
    assert.equal(porId(pirineo, '20371').lugar.region, 'Girona');
    assert.equal(porId(pirineo, '15573').lugar.region, 'Barcelona');
    // «…del <strong>Pirineo Catalán</strong>, son…»
    assert.equal(pirineuRural.descripcion, '... de dedicación. Restauradas con pasión y respeto por la tradición, nuestras casas, situadas en el corazón del Pirineo Catalán, son un refugio de calma, autenticidad y confort, donde cada detalle está...');
    // Viñetas con saltos de línea y tabuladores en el HTML.
    assert.equal(porId(pirineo, '10149').descripcion, '... bosque. • 4 Habitaciones dobles • 3 Habitaciones triples • 1 Habitación para 5 personas • Opc...');
  });

  it('la misma casa tiene el mismo id y precio en dos listados distintos', () => {
    const enBarcelona = porId(parsear(BARCELONA), '15573');
    const enPirineo = porId(parsear(PIRINEO), '15573');
    for (const campo of ['id', 'titulo', 'url', 'imagen', 'precio', 'unidad', 'precioTexto']) {
      assert.deepEqual(enPirineo[campo], enBarcelona[campo], campo);
    }
  });

  it('el id sale del data-id de la casa, no de su posición en el listado', () => {
    const ids = segunElHtml(BARCELONA).ids;
    const alReves = parsear(pagina(...[...ids].reverse().map((id) => tarjeta(BARCELONA, id))));
    const original = parsear(BARCELONA);
    assert.deepEqual(alReves.map((o) => o.id), [...original.map((o) => o.id)].reverse());
    for (const o of alReves) assert.equal(o.precio, porId(original, o.id.split(':')[1]).precio, o.id);
  });
});

describe('tuscasasrurales: casos límite', () => {
  it('devuelve null si la página no trae tarjetas: vacía, desafío anti-bot o web cambiada', () => {
    assert.equal(parsear(''), null);
    assert.equal(parsear(DESAFIO), null);
    assert.equal(parsear(SIN_TARJETAS), null);
    // Una tarjeta sin data-id no es una casa del listado.
    assert.equal(parsear(pagina(tarjeta(BARCELONA, '15573').replace(' data-id="15573"', ''))), null);
  });

  it('una casa sin precio se queda, pero sin precio ni unidad', () => {
    for (const [precio, unidad] of [['Consultar precio', null], ['Desde 0€', 'persona/noche'], ['Gratis', 'persona/noche']]) {
      const casa = unica(pagina(conPrecio(tarjeta(BARCELONA, '15573'), precio, unidad)));
      assert.deepEqual(validarOferta(casa), [], precio);
      assert.equal(casa.precio, null, `«${precio}» no es un precio de casa rural`);
      assert.equal(casa.unidad, null);
      assert.equal(casa.precioTexto, '');
    }
  });

  it('sin la unidad junto al precio no se inventa si es por persona o por casa', () => {
    const casa = unica(pagina(conPrecio(tarjeta(BARCELONA, '15573'), 'Desde 30€', null)));
    assert.deepEqual([casa.precio, casa.unidad, casa.precioTexto], [null, null, '']);
  });

  it('precioDe: decimales, miles y precio por alojamiento', () => {
    assert.deepEqual(precioDe({ precio: 'Desde 32,50€', unidad: 'persona/noche' }), { precio: 32.5, precioTexto: 'desde 32,5 € por persona y noche', unidad: 'pp/noche' });
    assert.deepEqual(precioDe({ precio: 'Desde 12.500€', unidad: 'Persona / Noche' }), { precio: 12500, precioTexto: 'desde 12.500 € por persona y noche', unidad: 'pp/noche' });
    assert.deepEqual(precioDe({ precio: 'Desde 250€', unidad: 'casa/noche' }), { precio: 250, precioTexto: 'desde 250 € por alojamiento y noche', unidad: 'noche' });
    assert.deepEqual(precioDe({ precio: '', unidad: '' }), { precio: null, precioTexto: '', unidad: null });
  });

  it('decodifica entidades y quita etiquetas de título, municipio y descripción', () => {
    const html = conParrafo(tarjeta(BARCELONA, '15573'), 'Masía del s.&nbsp;XVIII con <strong>piscina</strong> &amp; <em>barbacoa</em>, a 1&nbsp;h de Barcelona. Desde 30&euro; &quot;todo incluido&quot;')
      .replace('>El Pla de Besora</a>', '>Cal Pep &amp; M&ograve;nica&#39;s</a>')
      .replace('<p class="ficha-ciudad">Santa Maria de Besora</p>', '<p class="ficha-ciudad">Borred&agrave; (Bergued&agrave;)</p>');
    const casa = unica(pagina(html));
    assert.equal(casa.titulo, 'Cal Pep & Mònica\'s');
    assert.equal(casa.lugar.nombre, 'Borredà');
    assert.equal(casa.descripcion, 'Masía del s. XVIII con piscina & barbacoa, a 1 h de Barcelona. Desde 30€ "todo incluido"');
  });

  it('recorta la descripción larga a 300 caracteres sin partir palabras', () => {
    const original = porId(parsear(BARCELONA), '15573').descripcion;
    const larga = `${original}. ${original}`;
    const casa = unica(pagina(conParrafo(tarjeta(BARCELONA, '15573'), larga)));
    assert.ok(casa.descripcion.length <= 300, String(casa.descripcion.length));
    assert.ok(casa.descripcion.endsWith('…'));
    const cuerpo = casa.descripcion.slice(0, -1);
    assert.ok(larga.startsWith(cuerpo));
    assert.equal(larga[cuerpo.length], ' ', 'corta en un espacio');
  });

  it('descarta y registra la casa sin id, sin enlace o sin título, y sigue con las demás', () => {
    const sinId = tarjeta(BARCELONA, '15573').replace('data-id="15573"', 'data-id=""');
    const sinEnlace = tarjeta(BARCELONA, '10149').replace(' href="https://www.tuscasasrurales.com/baumala-f10149.htm"', '');
    const sinTitulo = tarjeta(BARCELONA, '21400').replace('>Ca L´avi</a>', '> </a>');
    const { ctx, logs } = crearCtx();
    const ofertas = parsear(pagina(sinId, sinEnlace, sinTitulo, tarjeta(BARCELONA, '18107')), ctx);
    assert.deepEqual(ofertas.map((o) => o.id), ['tuscasasrurales:18107']);
    assert.equal(logs.length, 3);
    assert.match(logs[0], /^Casa descartada \(sin id\): sin identificador o sin enlace$/);
    assert.match(logs[1], /^Casa descartada \(10149\): sin identificador o sin enlace$/);
    assert.match(logs[2], /^Casa descartada \(21400\): .*falta título/);
  });

  it('una casa sin fotos queda sin imagen, no con el icono de favoritos', () => {
    // En todas las tarjetas reales el corazón de «Añadir a favoritos» es un <img> más de .ficha-imagen.
    const sinFotos = tarjeta(BARCELONA, '10149').replace(/<swiper-slide[\s\S]*?<\/swiper-slide>/g, '');
    assert.match(sinFotos, /class="btn-fav"/);
    assert.equal(unica(pagina(sinFotos)).imagen, null);
  });
});

describe('tuscasasrurales: obtener', () => {
  it('declara las seis páginas de listado de la web', () => {
    assert.equal(fuente.id, 'tuscasasrurales');
    assert.equal(fuente.modo, 'html');
    assert.deepEqual(fuente.requiere, []);
    assert.deepEqual(fuente.urls, [
      `${WEB}/casas-rurales-barcelona.htm`,
      `${WEB}/casas-rurales-girona.htm`,
      `${WEB}/casas-rurales-lleida.htm`,
      `${WEB}/casas-rurales-tarragona.htm`,
      `${WEB}/casas-rurales-pirineo-catalan-z5.htm`,
      `${WEB}/casas-rurales-montseny-1117.htm`,
    ]);
  });

  it('pide las seis páginas en orden con pausas de 2 s y quita las casas repetidas entre páginas', async () => {
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: red(TODAS) });
    const resultado = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.deepEqual(esperas, [2000, 2000, 2000, 2000, 2000]);
    assert.deepEqual(logs, []);
    assert.equal(resultado.ofertas.length, 44, '120 tarjetas, 44 casas distintas');
    assert.equal(new Set(resultado.ofertas.map((o) => o.id)).size, 44);
    // Se queda con la primera aparición: la del listado de su provincia.
    assert.equal(porId(resultado.ofertas, '15573').descripcion, porId(parsear(BARCELONA), '15573').descripcion);
    for (const o of resultado.ofertas) assert.deepEqual(validarOferta(o), [], o.id);
  });

  it('si una página falla (HTTP 500), devuelve las casas de las demás', async () => {
    const respuestas = [BARCELONA, new ErrorHttp(500, URL_GIRONA), PIRINEO, BARCELONA, PIRINEO, BARCELONA];
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: red(respuestas) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.equal(esperas.length, 5);
    assert.deepEqual(logs, [`${URL_GIRONA}: HTTP 500 en www.tuscasasrurales.com`]);
    // Barcelona (20) + las 8 del Pirineo que no están en Barcelona (4 de Girona y 4 nuevas).
    assert.equal(ofertas.length, 28);
    assert.equal(porId(ofertas, '11102'), undefined, 'Mas Ca l`Estrada solo sale en Girona');
    assert.ok(porId(ofertas, '14236'), 'Mas Danyans también sale en el Pirineo');
  });

  it('una página sin tarjetas se registra y no corta las demás', async () => {
    const respuestas = [BARCELONA, GIRONA, PIRINEO, BARCELONA, PIRINEO, SIN_TARJETAS];
    const { ctx, peticiones, logs } = crearCtx({ respuestas: red(respuestas) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 6);
    assert.equal(ofertas.length, 44);
    assert.deepEqual(logs, [`${fuente.urls[5]}: la página no trae ninguna tarjeta de casa (¿ha cambiado la web?)`]);
  });

  it('ante un 403 deja de pedir y devuelve lo leído', async () => {
    const respuestas = [BARCELONA, GIRONA, new ErrorHttp(403, URL_LLEIDA), PIRINEO, PIRINEO, GIRONA];
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: red(respuestas) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls.slice(0, 3));
    assert.deepEqual(esperas, [2000, 2000]);
    assert.equal(ofertas.length, 40);
    assert.equal(logs.length, 2);
    assert.match(logs[0], /HTTP 403/);
    assert.match(logs[1], /bloqueado o limitado/);
  });

  it('ante un desafío anti-bot a mitad también deja de pedir y devuelve lo leído', async () => {
    const respuestas = [BARCELONA, DESAFIO, PIRINEO, BARCELONA, PIRINEO, GIRONA];
    const { ctx, peticiones, logs } = crearCtx({ respuestas: red(respuestas) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 2);
    assert.equal(ofertas.length, 20);
    assert.ok(logs.some((l) => l.includes('desafío anti-bot')));
    assert.ok(logs.some((l) => l.includes('bloqueado o limitado')));
  });

  it('un 429 en la primera página: no pide más y lanza un error claro', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: red([new ErrorHttp(429, URL_BARCELONA), ...TODAS.slice(1)]) });
    await assert.rejects(fuente.obtener(ctx), /^Error: No se ha podido leer ninguna página de Tus Casas Rurales \(último error: HTTP 429 en www\.tuscasasrurales\.com\)$/);
    assert.equal(peticiones.length, 1);
  });

  it('si fallan todas lo intenta con todas y lanza un error claro', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: (url) => { throw new ErrorHttp(500, url); } });
    await assert.rejects(fuente.obtener(ctx), /No se ha podido leer ninguna página de Tus Casas Rurales \(último error: HTTP 500/);
    assert.deepEqual(peticiones, fuente.urls);
  });

  it('si solo recibe desafíos anti-bot, lo dice y no insiste', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => DESAFIO });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de Tus Casas Rurales.*desafío anti-bot/);
    assert.equal(peticiones.length, 1);
  });

  it('no pide reemplazar: una página caída no borra sus casas guardadas', async () => {
    const ayer = new Date(AHORA.getTime() - 24 * 60 * 60 * 1000);
    const estado = estadoInicial();
    fusionar(estado, 'tuscasasrurales', { ofertas: parsear(GIRONA) }, ayer);

    const respuestas = [BARCELONA, new ErrorHttp(500, URL_GIRONA), PIRINEO, BARCELONA, PIRINEO, BARCELONA];
    const { ctx } = crearCtx({ respuestas: red(respuestas) });
    const resultado = await fuente.obtener(ctx);
    assert.equal(resultado.reemplazar, undefined);
    const { borradas } = fusionar(estado, 'tuscasasrurales', resultado, AHORA);
    assert.equal(borradas, 0);
    // Solo estaba en Girona: sigue guardada y caducará por retencionDias si no vuelve a salir.
    assert.equal(estado.ofertas['tuscasasrurales:11102'].vistaUltima, ayer.toISOString());
    // También sale en el Pirineo, que sí se ha leído.
    assert.equal(estado.ofertas['tuscasasrurales:14236'].vistaUltima, AHORA.toISOString());
  });

  it('aunque se lean todas, no borra las casas de páginas siguientes del listado', async () => {
    // Una casa que solo aparece en la página 2 (no se pide): la de El Pla de Besora con otro id.
    const deLaPagina2 = unica(pagina(tarjeta(BARCELONA, '15573').replaceAll('15573', '99999')));
    const estado = estadoInicial();
    fusionar(estado, 'tuscasasrurales', { ofertas: [deLaPagina2] }, AHORA);
    const { ctx } = crearCtx({ respuestas: red(TODAS) });
    const { borradas } = fusionar(estado, 'tuscasasrurales', await fuente.obtener(ctx), AHORA);
    assert.equal(borradas, 0);
    assert.ok(estado.ofertas['tuscasasrurales:99999']);
  });
});

describe('tuscasasrurales: robots.txt', () => {
  const robots = leerFixture('tuscasasrurales-robots.txt');

  it('permite todas las URLs que declara la fuente', () => {
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.ok(rutaPermitida(robots, `${pathname}${search}`), url);
    }
  });

  it('respeta lo que su robots.txt prohíbe, que la fuente no pide', () => {
    const prohibidas = [
      '/iframeMapa.php',
      '/mapa-casas-rurales-barcelona.htm',
      '/casas-rurales-barcelona.htm?Piscina=1',
      '/casas-rurales-girona.htm?Spa=1',
      '/casas-rurales-lleida.htm?Animales=1',
    ];
    for (const ruta of prohibidas) assert.ok(!rutaPermitida(robots, ruta), ruta);
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.equal(search, '', `${url}: sin filtros ni paginación`);
      assert.ok(!prohibidas.some((ruta) => ruta.split('?')[0] === pathname && ruta.includes('?') === false), url);
      assert.ok(!pathname.startsWith('/mapa-') && !pathname.startsWith('/iframeMapa'), url);
    }
  });
});
