import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MINIMO_OFERTAS, generarPaginas } from '../src/paginas.js';

const datos = JSON.parse(readFileSync(new URL('./fixtures/panel-real/ofertas.json', import.meta.url), 'utf8'));
const BASE = 'https://usuario.github.io/escapadas-finde/';

describe('páginas para buscadores', () => {
  const { archivos, rutas } = generarPaginas(datos, { base: BASE });
  const pagina = (ruta) => archivos.find((a) => a.ruta === `${ruta}/index.html`)?.contenido;

  it('solo se publican las guías con ofertas suficientes, cada una con URL legible y canonical', () => {
    assert.ok(rutas.length > 0);
    for (const ruta of rutas) {
      const html = pagina(ruta);
      assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}${ruta}/">`));
      assert.ok((html.match(/<li class="fila-guia">/g) ?? []).length >= MINIMO_OFERTAS, ruta);
      assert.match(html, /<meta name="description" content="[^"]+ ofertas comparadas/);
      assert.ok(!/<script/i.test(html), 'funciona sin JavaScript');
      assert.ok(!html.includes('undefined') && !html.includes('NaN'), ruta);
    }
    const escasas = generarPaginas({ ...datos, ofertas: datos.ofertas.slice(0, 3) }, { base: BASE });
    assert.deepEqual(escasas.rutas, [], 'con pocas ofertas no se publica ninguna guía vacía');
  });

  it('las rutas relativas llegan a la raíz y al panel con sus filtros', () => {
    const [ruta] = rutas.filter((r) => r.includes('/'));
    const html = pagina(ruta);
    assert.match(html, /href="\.\.\/\.\.\/css\/estilos\.css"/);
    assert.match(html, /href="\.\.\/\.\.\/#\/[a-z]+\?/);
  });

  it('datos propios y sin copiar descripciones de los proveedores', () => {
    const html = pagina('escapadas');
    assert.match(html, /viaje completo ≈? ?\d+\s€ para 2/);
    assert.match(html, /comprobada el /);
    for (const o of datos.ofertas.filter((x) => x.descripcion?.length > 60).slice(0, 20)) {
      assert.ok(!html.includes(o.descripcion.slice(0, 60)), `no copia la descripción de ${o.id}`);
    }
    assert.match(html, /rel="(sponsored )?nofollow noopener"/);
  });

  it('sitemap con la portada y las guías; sin URL pública, sin sitemap ni canonical', () => {
    const sitemap = archivos.find((a) => a.ruta === 'sitemap.xml').contenido;
    assert.equal((sitemap.match(/<url>/g) ?? []).length, rutas.length + 1);
    assert.match(sitemap, new RegExp(`<loc>${BASE}</loc>`));
    const local = generarPaginas(datos, {});
    assert.ok(!local.archivos.some((a) => a.ruta === 'sitemap.xml'));
    assert.ok(!local.archivos[0].contenido.includes('rel="canonical"'));
  });
});
