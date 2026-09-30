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
      assert.ok(!/<script(?! type="application\/ld\+json")/i.test(html), 'funciona sin JavaScript (solo datos estructurados, que no se ejecutan)');
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
    assert.ok(!local.archivos[0].contenido.includes('application/ld+json'), 'sin URL pública, sin datos estructurados (necesitan direcciones absolutas)');
  });

  it('robots.txt deja leer los datos (el panel los necesita para pintarse) y apunta al sitemap', () => {
    const robots = archivos.find((a) => a.ruta === 'robots.txt').contenido;
    assert.doesNotMatch(robots, /Disallow/);
    assert.match(robots, new RegExp(`Sitemap: ${BASE}sitemap.xml`));
  });

  it('guías por temática, alojamiento, distancia, puente y zona, sin chocar entre ellas', () => {
    for (const ruta of ['escapadas/playa', 'escapadas/casas-rurales', 'escapadas/a-menos-de-2-horas', 'escapadas/puente', 'escapadas/girona', 'escapadas/cataluna']) {
      assert.ok(rutas.includes(ruta), ruta);
    }
    assert.equal(new Set(rutas).size, rutas.length, 'cada guía en su carpeta');
    const girona = pagina('escapadas/girona');
    assert.match(girona, /<h1>Escapadas en Girona desde Barcelona<\/h1>/);
    assert.match(girona, /href="\.\.\/\.\.\/#\/escapadas\?region=Girona&amp;orden=total"/, 'la misma búsqueda en el panel');
    assert.match(pagina('escapadas/puente'), /<title>Escapadas para el puente del [^<]+ desde Barcelona · Escapadas Finde<\/title>/);
    for (const ruta of rutas) {
      const titulo = pagina(ruta).match(/<title>([^<]+)<\/title>/)[1];
      assert.ok(titulo.length <= 80, `título corto para los resultados de búsqueda: ${titulo}`);
    }
  });

  it('cada guía: datos estructurados válidos, migas, vista previa al compartir y enlaces a las demás', () => {
    const html = pagina('escapadas/spa');
    const [json] = [...html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const tipos = json['@graph'].map((n) => n['@type']);
    assert.deepEqual(tipos, ['WebSite', 'Organization', 'CollectionPage', 'BreadcrumbList']);
    const migas = json['@graph'].find((n) => n['@type'] === 'BreadcrumbList').itemListElement;
    assert.deepEqual(migas.map((m) => m.item), [BASE, `${BASE}escapadas/`, `${BASE}escapadas/spa/`]);
    assert.match(html, /<nav class="migas" aria-label="Estás en"><ol><li><a href="\.\.\/\.\.\/">Inicio<\/a><\/li><li><a href="\.\.\/\.\.\/escapadas\/">Escapadas<\/a><\/li><li aria-current="page">/);
    assert.match(html, new RegExp(`<meta property="og:image" content="${BASE}og.png">`));
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    // Enlaza a todas las demás guías y no a sí misma.
    for (const ruta of rutas.filter((r) => r !== 'escapadas/spa')) assert.ok(html.includes(`href="../../${ruta}/"`), ruta);
    assert.ok(!html.includes('href="../../escapadas/spa/"'));
    // Un «<» en un título no puede cerrar el JSON-LD.
    const conMarcas = generarPaginas({ ...datos, ofertas: datos.ofertas.map((o) => ({ ...o, titulo: `${o.titulo} </script><b>` })) }, { base: BASE });
    const spa = conMarcas.archivos.find((a) => a.ruta === 'escapadas/spa/index.html').contenido;
    assert.ok(!spa.includes('</script><b>'));
  });

  it('bloque de la portada sin JavaScript: qué es la web, lo mejor de ahora y todas las guías', () => {
    const { portada } = generarPaginas(datos, { base: BASE });
    assert.match(portada, /^<div class="portada-estatica">\n<h1>Escapadas de fin de semana desde Barcelona<\/h1>/);
    assert.ok((portada.match(/<li class="fila-guia">/g) ?? []).length >= MINIMO_OFERTAS);
    for (const ruta of rutas) assert.ok(portada.includes(`href="${ruta}/"`), ruta);
    assert.ok(!/<script/i.test(portada), 'el JSON-LD de la portada va en el <head>, no en lo que el panel repinta');
  });
});
