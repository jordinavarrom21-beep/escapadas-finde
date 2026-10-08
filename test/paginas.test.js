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
    // El precio comparable (viaje completo por persona), el publicado por su web y la cuenta.
    assert.match(html, /<strong>Viaje completo: ≈? ?\d+\s€ por persona<\/strong> \(\d+\s€ para 2 personas/);
    assert.match(html, /Precio en [^:]+: (desde )?\d+(,\d+)?\s€ (por|en|ida)/);
    assert.match(html, /<p class="suave fila-guia__cuenta">Cuenta: [^<]+ = \d+\s€ entre 2 = \d+\s€ por persona\./);
    assert.match(html, /precio visto allí el /);
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

  it('las guías con texto propio lo publican (consejos y preguntas) y escapado', () => {
    const html = pagina('escapadas');
    assert.match(html, /<section class="guia-texto" aria-label="Sobre esta guía">\n<h2>Cómo elegir una escapada de fin de semana desde Barcelona<\/h2>/);
    assert.match(html, /<h2>Preguntas frecuentes<\/h2>/);
    assert.match(html, /<h3>Consejos<\/h3>/);
    assert.ok(html.indexOf('lista-guia') < html.indexOf('guia-texto'), 'el texto va después de las ofertas');
    // Una guía sin título propio usa el de su enlace.
    assert.match(pagina('escapadas/playa'), /<h2>[^<]+: qué tener en cuenta<\/h2>/);
  });

  it('lastmod del sitemap: el día de la oferta más reciente de cada guía, no el del escaneo', () => {
    const sitemap = archivos.find((a) => a.ruta === 'sitemap.xml').contenido;
    // Un escaneo al día siguiente que vuelve a ver las mismas ofertas (siguen vigentes).
    const masUnDia = (iso) => new Date(Date.parse(iso) + 86_400_000).toISOString();
    const viejo = { ...datos, generado: masUnDia(datos.generado), ofertas: datos.ofertas.map((o) => ({ ...o, vistaUltima: masUnDia(o.vistaUltima) })) };
    const otro = generarPaginas(viejo, { base: BASE }).archivos.find((a) => a.ruta === 'sitemap.xml').contenido;
    assert.ok(!otro.includes(viejo.generado.slice(0, 10)), 'un escaneo sin ofertas nuevas no cambia lastmod');
    for (const m of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/);
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
    // La guía general no repite el título de la portada (competirían por la misma búsqueda).
    assert.doesNotMatch(pagina('escapadas'), /<title>Escapadas de fin de semana desde/);
    // Un título largo va sin « · Escapadas Finde» (si no, Google lo corta).
    assert.match(pagina('escapadas/puente'), /<title>Escapadas para el puente del [^<]+ desde Barcelona( · Escapadas Finde)?<\/title>/);
    for (const ruta of rutas) {
      const titulo = pagina(ruta).match(/<title>([^<]+)<\/title>/)[1];
      assert.ok(titulo.length <= 65 || !titulo.includes('Escapadas Finde'), `título corto para los resultados de búsqueda: ${titulo}`);
    }
  });

  it('cada guía: datos estructurados válidos, migas, vista previa al compartir y enlaces a las demás', () => {
    const html = pagina('escapadas/rurales');
    const [json] = [...html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const tipos = json['@graph'].map((n) => n['@type']);
    assert.deepEqual(tipos, ['WebSite', 'Organization', 'CollectionPage', 'BreadcrumbList', 'FAQPage']);
    // Texto propio debajo de la lista, con las mismas preguntas que el FAQPage y la ciudad de origen puesta.
    const faq = json['@graph'].find((n) => n['@type'] === 'FAQPage').mainEntity;
    assert.ok(faq.length >= 1);
    for (const p of faq) assert.ok(html.includes(`<h3>${p.name}</h3>`), p.name);
    assert.match(html, /<section class="guia-texto" aria-label="Sobre esta guía">/);
    assert.ok(!html.includes('{desde}'));
    const migas = json['@graph'].find((n) => n['@type'] === 'BreadcrumbList').itemListElement;
    assert.deepEqual(migas.map((m) => m.item), [BASE, `${BASE}escapadas/`, `${BASE}escapadas/rurales/`]);
    assert.match(html, /<nav class="migas" aria-label="Estás en"><ol><li><a href="\.\.\/\.\.\/">Inicio<\/a><\/li><li><a href="\.\.\/\.\.\/escapadas\/">Escapadas<\/a><\/li><li aria-current="page">/);
    assert.match(html, new RegExp(`<meta property="og:image" content="${BASE}og.png">`));
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    // Enlaza a todas las demás guías y no a sí misma.
    for (const ruta of rutas.filter((r) => r !== 'escapadas/rurales')) assert.ok(html.includes(`href="../../${ruta}/"`), ruta);
    assert.ok(!html.includes('href="../../escapadas/rurales/"'));
    // Un «<» en un título no puede cerrar el JSON-LD.
    // Ni un «javascript:» de una web de ofertas llega a un enlace.
    const conMarcas = generarPaginas({ ...datos, ofertas: datos.ofertas.map((o) => ({ ...o, titulo: `${o.titulo} </script><b>`, urlReserva: 'javascript:alert(1)' })) }, { base: BASE });
    const spa = conMarcas.archivos.find((a) => a.ruta === 'escapadas/rurales/index.html').contenido;
    assert.ok(!spa.includes('</script><b>'));
    assert.ok(!/href="javascript:/i.test(spa));
    assert.match(spa, /<a href="https:\/\/[^"]+" rel="(sponsored )?nofollow noopener" target="_blank">Ver la oferta<span class="sr"> en [^<]+ \(se abre en otra pestaña\)<\/span><\/a>/, 'se usa la URL de la oferta');
  });

  it('bloque de la portada sin JavaScript: qué es la web, lo mejor de ahora y todas las guías', () => {
    const { portada } = generarPaginas(datos, { base: BASE });
    assert.match(portada, /^<div class="portada-estatica">\n<h1>Escapadas de fin de semana desde Barcelona<\/h1>/);
    assert.ok((portada.match(/<li class="fila-guia">/g) ?? []).length >= MINIMO_OFERTAS);
    for (const ruta of rutas) assert.ok(portada.includes(`href="${ruta}/"`), ruta);
    assert.ok(!/<script/i.test(portada), 'el JSON-LD de la portada va en el <head>, no en lo que el panel repinta');
  });
});

describe('guías: solo viajes con alojamiento vigentes y el precio comparable explicado', () => {
  const generado = '2026-10-08T12:00:00.000Z';
  const base = {
    fuente: 'prueba', tipo: 'escapada', etiquetas: [], temas: [], fechas: { salida: null }, vistaUltima: '2026-10-08T11:00:00.000Z',
    lugar: { nombre: 'Sitges', provincia: 'Barcelona' }, cocheMin: 40, cocheKm: 40, costeCoche: { eur: 6, litros: 4 },
  };
  const hotel = (i, extra = {}) => ({ ...base, id: `prueba:${i}`, titulo: `Hotel ${i}`, alojamiento: 'hotel', precio: 40 + i, unidad: 'pp', ...extra });
  const fijo = (o) => ({ origen: { nombre: 'Barcelona', lat: 41.39, lon: 2.17 }, fuentes: [{ id: 'prueba', nombre: 'Prueba', intervaloMin: 60 }], generado, ofertas: o });
  const guia = (ofertas) => generarPaginas(fijo(ofertas), { base: BASE }).archivos.find((a) => a.ruta === 'escapadas/menos-de-100-euros/index.html')?.contenido ?? '';

  it('«menos de 100 €» no mezcla entradas, restaurantes, descuentos ni ofertas sin coste calculable', () => {
    const html = guia([
      ...[1, 2, 3, 4, 5].map((i) => hotel(i)),
      { ...base, id: 'prueba:teatro', titulo: 'Entradas de teatro', precio: 15, unidad: null },
      { ...base, id: 'prueba:pizza', titulo: 'Menú en una pizzería', precio: 12, unidad: 'pp' },
      { ...base, id: 'prueba:app', titulo: '15 € de descuento en la app', precio: 15, unidad: null },
      hotel(9, { id: 'prueba:sin-unidad', titulo: 'Hotel sin unidad', unidad: null }),
    ]);
    assert.match(html, /Criterios: 5 ofertas vigentes cumplen/);
    for (const fuera of ['Entradas de teatro', 'pizzería', 'descuento en la app', 'Hotel sin unidad']) assert.ok(!html.includes(fuera), fuera);
  });

  it('sin caducadas ni «sin confirmar», y el recuento es el de lo que se enseña', () => {
    const html = guia([
      ...[1, 2, 3, 4, 5].map((i) => hotel(i)),
      hotel(6, { titulo: 'Caducada', caduca: '2026-10-07T00:00:00.000Z' }),
      hotel(7, { titulo: 'Vista hace 3 días', vistaUltima: '2026-10-05T11:00:00.000Z' }),
    ]);
    assert.match(html, /Criterios: 5 ofertas vigentes cumplen/);
    assert.equal((html.match(/<li class="fila-guia">/g) ?? []).length, 5);
    assert.ok(!html.includes('Caducada') && !html.includes('Vista hace 3 días'));
  });

  it('si el precio publicado pasa de 100 € pero por persona no, se explica al momento', () => {
    const html = guia([...[1, 2, 3, 4].map((i) => hotel(i)), hotel(5, { titulo: 'Casa para dos', precio: 150, unidad: 'total' })]);
    assert.match(html, /Precio en Prueba: desde 150\s€ en total/);
    assert.match(html, /Cumple «menos de 100\s€ por persona» aunque el precio publicado sea mayor: ese precio es en total y por persona sale a \d+\s€\./);
    // Cómo se compara, una vez arriba: viajeros, noches, gasolina y lo que no incluye.
    assert.match(html, /Cómo se compara: el <strong>viaje completo por persona<\/strong> para 2 personas, con 2 noches cuando la oferta se cobra por noche/);
  });
});
