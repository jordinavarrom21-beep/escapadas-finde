import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anadirFotos, fotoDeArticulo, licenciaDe, quitarFotoSinPermiso, tituloDeBusqueda } from '../src/enriquecer/fotos.js';
import { crearCtx, leerFixtureJson, oferta } from './ayudas.js';

const TURIN = leerFixtureJson('wikimedia-turin.json');
const miniatura = (archivo, hash = 'c/cd') => `//upload.wikimedia.org/wikipedia/commons/thumb/${hash}/${encodeURIComponent(archivo)}/250px-${encodeURIComponent(archivo)}`;
/** Lo que importa de un artículo de la Viquipèdia: sus coordenadas y la infotaula (bandera y escudo antes que la foto). */
const articulo = ({ lat = 42.2619, lon = 3.1769, fotos = ['Globe_icon.svg', 'Bandera_de_Roses.svg', 'Escut_de_Roses.svg', 'Roses_mit_Sporthafen.jpg'] } = {}) => `<html><head>
<script>RLCONF={"wgWikibaseItemId":"Q11822","wgCoordinates":{"lat":${lat},"lon":${lon}}};</script></head><body>
<table class="infobox">${fotos.map((f) => `<tr><td><img src="${miniatura(f)}"></td></tr>`).join('')}</table></body></html>`;
/** La página de un archivo en Commons: sus datos para máquinas (licencia, enlace y autor). */
const commons = ({ licencia = 'CC BY-SA 3.0', autor = 'Tigerente' } = {}) => `<html><body><table>
<tr><td id="fileinfotpl_aut">Autor</td><td><a href="/wiki/User:${autor}">${autor}</a></td></tr></table>
<span class="licensetpl_short">${licencia}</span><span class="licensetpl_link">https://creativecommons.org/licenses/by-sa/3.0</span></body></html>`;
const BUSQUEDA_ROSES = { pages: [{ title: 'Roses', thumbnail: { url: '//thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Bandera_de_Roses.svg/60px-Bandera_de_Roses.svg.png' } }] };
const roses = (extra = {}) => oferta({ imagen: null, lugar: { nombre: 'Roses', provincia: 'Girona', comunidad: 'Cataluña', pais: 'España', codigoPais: 'ES', lat: 42.26, lon: 3.18 }, ...extra });

/** Red simulada: búsqueda, artículo y Commons; robots.txt vacío (todo permitido). */
const red = ({ busqueda = BUSQUEDA_ROSES, html = articulo(), archivo = commons() } = {}) => (url) => {
  if (url.endsWith('robots.txt')) return '';
  if (url.includes('/search/page')) return busqueda;
  if (url.includes('commons.wikimedia.org/wiki/File:')) return archivo;
  if (url.includes('.wikipedia.org/wiki/')) return html;
  throw new Error(`url inesperada: ${url}`);
};

describe('fotos de destino: la de la ficha del artículo, con autor y licencia', () => {
  it('el título de la búsqueda solo si es el del lugar', () => {
    assert.equal(tituloDeBusqueda(TURIN, 'Turín'), 'Turín');
    assert.equal(tituloDeBusqueda(TURIN, 'Tarragona'), null);
    assert.equal(tituloDeBusqueda({ pages: [] }, 'Turín'), null);
  });

  it('de la ficha, la primera foto que no es bandera, escudo, mapa ni icono, a 500 px', () => {
    assert.deepEqual(fotoDeArticulo(articulo()), {
      archivo: 'Roses_mit_Sporthafen.jpg',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Roses_mit_Sporthafen.jpg/500px-Roses_mit_Sporthafen.jpg',
      punto: { lat: 42.2619, lon: 3.1769 },
    });
    assert.equal(fotoDeArticulo(articulo({ fotos: ['Bandera_de_Salou.svg', 'Escudo_de_Salou.png', 'Mapa_de_Salou.png', 'Flag_of_Andorra.png'] })), null);
  });

  it('licencia y autor de Commons; una licencia que no es libre no vale', () => {
    assert.deepEqual(licenciaDe(commons()), { licencia: 'CC BY-SA 3.0', licenciaUrl: 'https://creativecommons.org/licenses/by-sa/3.0', autor: 'Tigerente' });
    assert.equal(licenciaDe(commons({ licencia: 'Fair use' })), null);
    assert.equal(licenciaDe('<html></html>'), null);
  });

  it('pone la foto con un crédito que dice de dónde es, el autor y la licencia; el lugar se pide una vez', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: red() });
    const [a, b] = [roses(), roses()];
    await anadirFotos([a, b], ctx);
    assert.equal(a.imagen, 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Roses_mit_Sporthafen.jpg/500px-Roses_mit_Sporthafen.jpg');
    assert.deepEqual(a.imagenCredito, {
      texto: 'Foto de Roses: Tigerente · CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Roses_mit_Sporthafen.jpg',
      autor: 'Tigerente', licencia: 'CC BY-SA 3.0', licenciaUrl: 'https://creativecommons.org/licenses/by-sa/3.0', lugar: 'Roses',
    });
    assert.equal(b.imagen, a.imagen);
    assert.ok(peticiones.some((u) => u.startsWith('https://api.wikimedia.org/core/v1/wikipedia/ca/search/page?q=Roses')), 'pueblo catalán: en la Viquipèdia');
    assert.equal(peticiones.filter((u) => u.includes('/search/page')).length, 1);
    const otra = roses();
    await anadirFotos([otra], ctx);
    assert.equal(peticiones.filter((u) => u.includes('/search/page')).length, 1, 'la segunda vez sale de la caché');
    assert.equal(otra.imagen, a.imagen);
  });

  it('un artículo de otro sitio con el mismo nombre (a más de 30 km) no da foto', async () => {
    const { ctx } = crearCtx({ respuestas: red({ html: articulo({ lat: 41.70, lon: 2.19 }) }) });
    const lejos = roses({ lugar: { nombre: 'Roses', provincia: 'Girona', comunidad: 'Cataluña', codigoPais: 'ES', lat: 41.08, lon: 1.18 } });
    await anadirFotos([lejos], ctx);
    assert.equal(lejos.imagen, null);
  });

  it('de un vuelo se busca la ciudad si el aeropuerto no tiene artículo', async () => {
    const busquedas = [];
    const { ctx } = crearCtx({ respuestas: (url) => {
      if (url.includes('/search/page')) { busquedas.push(decodeURIComponent(url.split('q=')[1])); return url.includes('Malpensa') ? { pages: [{ title: 'Aeropuerto de Milán-Malpensa' }] } : { pages: [{ title: 'Milán' }] }; }
      return red({ html: articulo({ lat: 45.46, lon: 9.19, fotos: ['Milano_Duomo.jpg'] }) })(url);
    } });
    const vuelo = oferta({ tipo: 'vuelo', imagen: null, lugar: { nombre: 'Milán Malpensa', pais: 'Italia', codigoPais: 'IT', lat: 45.63, lon: 8.72 } });
    await anadirFotos([vuelo], ctx);
    assert.deepEqual(busquedas, ['Milán Malpensa&limit=1', 'Milán&limit=1']);
    assert.match(vuelo.imagen, /Milano_Duomo\.jpg$/);
  });

  it('las fotos de antes (la bandera, sin licencia) se quitan y se buscan otra vez', async () => {
    const bandera = roses({ imagen: 'https://thumb.wikimedia.org/x/500px-Flag_of_Barcelona.svg.png', imagenCredito: { texto: 'Foto: Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Flag_of_Barcelona.svg' } });
    assert.equal(quitarFotoSinPermiso(structuredClone(bandera), new Set()).imagen, null);
    const { ctx } = crearCtx({ respuestas: red() });
    await anadirFotos([bandera], ctx);
    assert.match(bandera.imagen, /Roses_mit_Sporthafen/);
    assert.equal(bandera.imagenCredito.licencia, 'CC BY-SA 3.0');
  });

  it('la foto de una web sin permiso se quita; la de Wikimedia con licencia se queda', () => {
    const deLaWeb = quitarFotoSinPermiso(oferta({ fuente: 'buscounchollo', imagen: 'https://www.buscounchollo.com/foto.jpg' }), new Set());
    assert.equal(deLaWeb.imagen, null);
    const buena = { imagen: 'https://upload.wikimedia.org/x.jpg', imagenCredito: { url: 'https://commons.wikimedia.org/wiki/File:X.jpg', licencia: 'CC0' } };
    assert.equal(quitarFotoSinPermiso(oferta(buena), new Set()).imagen, buena.imagen);
  });

  it('si la red falla, las ofertas se quedan como estaban', async () => {
    const { ctx } = crearCtx();
    const o = roses();
    await anadirFotos([o], ctx);
    assert.equal(o.imagen, null);
  });
});

describe('fotos: bloqueo', () => {
  it('un 403 para enseguida y lo dice una vez', async () => {
    const { ErrorHttp } = await import('../src/util/http.js');
    const { ctx, peticiones, logs } = crearCtx({ respuestas: (url) => { if (url.endsWith('robots.txt')) return ''; throw new ErrorHttp(403, url); } });
    const ofertas = ['Turín', 'Roma', 'Oporto'].map((nombre) => oferta({ tipo: 'vuelo', imagen: null, lugar: { nombre } }));
    await anadirFotos(ofertas, ctx);
    assert.equal(peticiones.filter((u) => u.includes('search/page')).length, 1);
    assert.equal(logs.filter((l) => l.includes('Sin fotos')).length, 1);
  });
});

describe('fotos de las webs de las ofertas (fotos.usarLasDeLasOfertas)', () => {
  it('con el ajuste (conPermiso null) se queda la de la web; las de Wikimedia sin licencia de antes siguen fuera', () => {
    const deLaWeb = quitarFotoSinPermiso(oferta({ fuente: 'buscounchollo', imagen: 'https://www.buscounchollo.com/foto.jpg' }), null);
    assert.equal(deLaWeb.imagen, 'https://www.buscounchollo.com/foto.jpg');
    const vieja = oferta({ imagen: 'https://upload.wikimedia.org/x.jpg', imagenCredito: { texto: 'Foto', url: 'https://commons.wikimedia.org/wiki/File:X.jpg' } });
    assert.equal(quitarFotoSinPermiso(vieja, null).imagen, null);
  });
});
