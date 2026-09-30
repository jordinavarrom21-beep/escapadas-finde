import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anadirFotos, fotoDeBusqueda } from '../src/enriquecer/fotos.js';
import { crearCtx, leerFixtureJson, oferta } from './ayudas.js';

const TURIN = leerFixtureJson('wikimedia-turin.json');

describe('fotos de destino de Wikimedia', () => {
  it('la miniatura de la búsqueda, a 500 px, con la página del archivo para el crédito', () => {
    assert.deepEqual(fotoDeBusqueda(TURIN, 'Turín'), {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Turin_Montage.png/500px-Turin_Montage.png',
      pagina: 'https://commons.wikimedia.org/wiki/File:Turin_Montage.png',
      titulo: 'Turín',
    });
    assert.equal(fotoDeBusqueda(TURIN, 'Tarragona'), null, 'si el artículo no es del lugar, sin foto');
    assert.equal(fotoDeBusqueda({ pages: [] }, 'Turín'), null);
  });

  it('una consulta por lugar para las ofertas sin foto; se guarda y no se repite', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: (url) => (url.endsWith('robots.txt') ? '' : TURIN) });
    const vuelos = [1, 2].map(() => oferta({ tipo: 'vuelo', imagen: null, lugar: { nombre: 'Turín', pais: 'Italia' } }));
    const conFoto = oferta({ imagen: 'https://ejemplo.es/foto.jpg', lugar: { nombre: 'Turín', pais: 'Italia' } });
    await anadirFotos([...vuelos, conFoto], ctx);
    assert.equal(peticiones.filter((u) => u.includes('search/page')).length, 1);
    assert.ok(vuelos.every((o) => o.imagen.endsWith('500px-Turin_Montage.png') && o.imagenCredito.url.includes('commons')));
    assert.equal(conFoto.imagen, 'https://ejemplo.es/foto.jpg', 'la foto de la propia web manda');
    const otra = oferta({ tipo: 'vuelo', imagen: null, lugar: { nombre: 'Turín', pais: 'Italia' } });
    await anadirFotos([otra], ctx);
    assert.equal(peticiones.filter((u) => u.includes('search/page')).length, 1, 'la segunda vez sale de la caché');
    assert.ok(otra.imagen);
  });

  it('si la red falla, las ofertas se quedan como estaban', async () => {
    const { ctx } = crearCtx();
    const vuelo = oferta({ tipo: 'vuelo', imagen: null, lugar: { nombre: 'Turín' } });
    await anadirFotos([vuelo], ctx);
    assert.equal(vuelo.imagen, null);
  });
});
