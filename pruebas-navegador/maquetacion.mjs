// Mide la maquetación en varios anchos: desbordes horizontales, textos cortados, cosas que se salen
// de su caja (también por abajo), tarjetas de una fila con las partes a distinta altura, la «ⓘ»
// encima de su rótulo, iconos vacíos y objetivos táctiles pequeños. Guarda la parte de arriba de cada vista.
// Uso: npm run test:maquetacion (sale con error si encuentra algo). Variables: ANCHOS, RUTAS,
// TEMAS (light,dark), LISTA=1 (modo lista), MIS=1 (búsquedas guardadas y favoritos), FOTOS=carpeta para guardar capturas.
import { mkdirSync } from 'node:fs';
import { arrancar, contexto } from './comun.mjs';

const dir = process.env.FOTOS;
if (dir) mkdirSync(dir, { recursive: true });
const { base: BASE, navegador: b, cerrar } = await arrancar();
const ANCHOS = (process.env.ANCHOS ?? '320,390,768,1024,1280,1440,1920').split(',').map(Number);
const RUTAS = (process.env.RUTAS ?? 'finde,vuelos,escapadas,actividades,mapa,calendario,puentes,vigilados,fuentes,buscar?q=spa,comparar').split(',');
const TEMAS = (process.env.TEMAS ?? 'light').split(',');
const problemas = [];
for (const tema of TEMAS) for (const ancho of ANCHOS) {
  const movil = ancho < 720;
  const c = await contexto(b, { viewport: { width: ancho, height: movil ? 800 : 900 }, colorScheme: tema, hasTouch: movil });
  // El oscuro ya no sigue al sistema: hay que elegirlo (se guarda como «oscuro»).
  if (tema === 'dark') await c.addInitScript(() => { try { localStorage.setItem('escapadas:tema', 'oscuro'); } catch {} });
  if (process.env.LISTA) await c.addInitScript(() => { window.__LISTA__ = true; });
  if (process.env.MIS) await c.addInitScript(() => {
    try {
      localStorage.setItem('escapadas:busquedas', JSON.stringify([{ nombre: 'Rural con nombre muy largo para ver cómo cabe', vista: 'escapadas', hash: '#/escapadas?temas=rural&h=2&pnMax=40', visto: '2026-08-01T00:00:00Z' }, { nombre: 'Spa', vista: 'buscar', hash: '#/buscar?q=spa', visto: null }]));
      localStorage.setItem('escapadas:misEstados', JSON.stringify({}));
    } catch {}
  });
  await c.addInitScript(() => {
    try { if (window.__LISTA__) localStorage.setItem('escapadas:modoLista', 'lista'); } catch {}
  });
  const p = await c.newPage();
  if (process.env.MIS) {
    // Con favoritos sale «Recomendado para ti» en la portada (tarjetas con su «Porque…»).
    await p.goto(BASE);
    await p.evaluate(async () => {
      // Solo de las que la web enseña: con datos de otro día, unas caducadas no darían recomendaciones.
      const datos = await (await fetch('data/ofertas.json')).json();
      const { repartir } = await import(new URL('js/vigencia.js', location.href));
      const { vigentes } = repartir(datos.ofertas, {
        ahora: new Date(),
        revision: Number.isFinite(Date.parse(datos.generado)) ? new Date(datos.generado) : new Date(),
        intervalos: new Map((datos.fuentes ?? []).map((f) => [f.id, f.intervaloMin])),
      });
      localStorage.setItem('escapadas:favoritos', JSON.stringify(vigentes.filter((o) => o.tipo !== 'vuelo').slice(0, 5).map((o) => o.id)));
    });
    // Los favoritos se leen al abrir la web: la primera ruta tiene que ser una carga nueva, no un cambio de #.
    await p.goto('about:blank');
  }
  p.on('pageerror', (e) => problemas.push(`[${tema} ${ancho}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_FAILED|tile\.openstreetmap/.test(m.text())) problemas.push(`[${tema} ${ancho}] console: ${m.text()}`); });
  for (const ruta of RUTAS) {
    await p.goto(`${BASE}#/${ruta}`);
    await p.waitForSelector('#principal .titulo-vista', { timeout: 15000 });
    if (ruta === 'comparar' && !(await p.locator('table.comparar').count())) {
      await p.goto(`${BASE}#/escapadas`);
      await p.waitForSelector('#resultados .tarjeta');
      // En modo lista del móvil el botón está oculto: se añaden con su código.
      await p.evaluate(() => { const b = [...document.querySelectorAll('#resultados .boton-comparar')].slice(0, 2); b.forEach((x) => x.click()); });
      await p.goto(`${BASE}#/comparar`);
      await p.waitForSelector('table.comparar');
    }
    // En el móvil los filtros empiezan plegados: se despliegan para medirlos también.
    if (movil) await p.evaluate(() => document.querySelectorAll('[data-plegable-movil]').forEach((d) => { d.open = true; }));
    await p.waitForTimeout(ruta === 'mapa' ? 1500 : 400);
    const r = await p.evaluate(({ movil }) => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) {
        // ¿Quién se sale? Lo que va dentro de algo que se desliza (o recorta) no cuenta.
        const deslizado = (el) => {
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return true;
          return false;
        };
        const culpables = [...document.querySelectorAll('body *')].filter((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.right > vw + 1 && !deslizado(el);
        }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${Math.round(el.getBoundingClientRect().right)})`);
        // Si ninguna caja se sale, es texto que no cabe en la suya.
        if (!culpables.length) {
          const textos = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const rango = document.createRange();
          for (let t; (t = textos.nextNode()) && culpables.length < 5;) {
            if (!t.textContent.trim() || deslizado(t)) continue;
            rango.selectNodeContents(t);
            const right = rango.getBoundingClientRect().right;
            if (right > vw + 1) culpables.push(`texto de ${t.parentElement.tagName.toLowerCase()}.${[...t.parentElement.classList].join('.')} «${t.textContent.trim().slice(0, 30)}» (${Math.round(right)})`);
          }
        }
        out.push(`scroll horizontal: ${document.documentElement.scrollWidth} > ${vw} · ${culpables.join(', ')}`);
      }
      const visible = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Texto cortado dentro de botones, chips y pastillas (sin desplazamiento intencionado).
      for (const el of document.querySelectorAll('.boton, .chip, .opcion, .pastilla, .navegacion a, .navegacion summary, .sello, .pastilla-foto, .insignia, .estado-fuentes, .seccion__enlace')) {
        if (!visible(el)) continue;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis') out.push(`texto cortado: ${el.className} «${el.textContent.trim().slice(0, 40)}» ${el.scrollWidth}>${el.clientWidth}`);
      }
      // Hijos que se salen de su caja (tarjetas, formularios, celdas).
      for (const caja of document.querySelectorAll('.tarjeta, .billete, .sugerencia, .buscador-finde, .filtros, .finde-celda, .puente, .vigilado, .vacio, .ficha__lateral, .ayuda-caja, .viaje-resumen, .explorar__filtros, .resultados__cabeza, .bloque, .campo')) {
        if (!visible(caja)) continue;
        const cb = caja.getBoundingClientRect();
        for (const h of caja.querySelectorAll('*')) {
          if (!visible(h)) continue;
          let a = h.parentElement; let desliza = false;
          while (a && a !== caja) { if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) { desliza = true; break; } a = a.parentElement; }
          if (desliza) continue;
          const hb = h.getBoundingClientRect();
          if (hb.right > cb.right + 1.5 || hb.left < cb.left - 1.5) { out.push(`se sale de ${caja.className.split(' ')[0]}: ${h.tagName.toLowerCase()}.${[...h.classList].join('.')} «${(h.textContent || '').trim().slice(0, 30)}» (${Math.round(hb.left)}–${Math.round(hb.right)} vs ${Math.round(cb.left)}–${Math.round(cb.right)})`); break; }
        }
      }
      // Partes de una tarjeta que se salen por abajo de su caja o se montan sobre la siguiente.
      for (const t of document.querySelectorAll('.tarjeta, .billete')) {
        if (!visible(t)) continue;
        const partes = [...t.querySelectorAll(':scope > *, .tarjeta__cuerpo > *, .billete__cuerpo > *, .billete__principal > *')].filter(visible);
        for (const h of partes) {
          if (getComputedStyle(h).overflowY === 'visible' && h.scrollHeight > h.clientHeight + 2) { out.push(`se sale por abajo: ${h.className.split(' ')[0]} «${h.textContent.trim().slice(0, 30)}» (${h.scrollHeight}>${h.clientHeight})`); break; }
        }
        const cuerpo = [...t.querySelectorAll(':scope > .tarjeta__media, .tarjeta__cuerpo > *, .billete__principal > *')].filter(visible);
        for (let i = 1; i < cuerpo.length; i++) {
          // (En lista, el precio va en otra columna: solo cuenta si además coinciden en horizontal.)
          const [a, z] = [cuerpo[i - 1].getBoundingClientRect(), cuerpo[i].getBoundingClientRect()];
          if (a.bottom > z.top + 1.5 && a.right > z.left + 1.5 && z.right > a.left + 1.5) { out.push(`se monta: ${cuerpo[i - 1].className.split(' ')[0]} sobre ${cuerpo[i].className.split(' ')[0]} «${cuerpo[i].textContent.trim().slice(0, 30)}»`); break; }
        }
      }
      // En una fila de la rejilla, cada parte de las tarjetas (y el talón y el pie de los billetes)
      // empieza a la misma altura. Solo donde se comparten filas (subgrid: desde 600 px, y los
      // billetes desde 720 sin tarjetas al lado).
      if (vw >= 600 && CSS.supports('grid-template-rows: subgrid') && CSS.supports('selector(:has(*))')) {
        const PARTES = { tarjeta: ['.tarjeta__titulo', '.tarjeta__opiniones', '.tarjeta__datos', '.insignias--tarjeta', '.tarjeta__estado', '.tarjeta__pie'], billete: ['.billete__talon', '.billete__pie'] };
        for (const rejilla of document.querySelectorAll('.rejilla')) {
          if (rejilla.matches('.modo-lista #resultados .rejilla')) continue;
          const filas = new Map();
          for (const t of rejilla.querySelectorAll('.tarjeta, .billete')) {
            if (!visible(t)) continue;
            const tipo = t.matches('.billete') ? 'billete' : 'tarjeta';
            if (tipo === 'billete' && (vw < 720 || rejilla.querySelector('.tarjeta'))) continue;
            const caja = t.getBoundingClientRect();
            const clave = `${tipo}:${Math.round(t.closest('.rejilla > *').getBoundingClientRect().top)}`;
            if (!filas.has(clave)) filas.set(clave, []);
            filas.get(clave).push({ t, y: PARTES[tipo].map((s) => { const e = t.querySelector(s); return e && visible(e) ? e.getBoundingClientRect().top - caja.top : null; }) });
          }
          for (const [clave, fila] of filas) {
            if (fila.length < 2) continue;
            PARTES[clave.split(':')[0]].forEach((s, i) => {
              const ys = fila.map((x) => x.y[i]).filter((y) => y !== null);
              if (ys.length > 1 && Math.max(...ys) - Math.min(...ys) > 2) out.push(`fila desalineada: ${s} (${Math.round(Math.min(...ys))}–${Math.round(Math.max(...ys))} px) «${fila[0].t.querySelector('.tarjeta__titulo')?.textContent.trim().slice(0, 25)}»`);
            });
          }
        }
      }
      // En el móvil, el círculo de la «ⓘ» abierta (28 px dentro de su área de 40) no tapa la palabra de antes.
      if (movil) {
        for (const boton of document.querySelectorAll('.boton-info')) {
          if (!visible(boton)) continue;
          let antes = boton.previousSibling;
          while (antes && !(antes.textContent ?? '').trim()) antes = antes.previousSibling;
          if (!antes) continue;
          const rango = document.createRange();
          rango.selectNodeContents(antes);
          const letras = [...rango.getClientRects()].at(-1);
          const b = boton.getBoundingClientRect();
          // Lo que se pinta al abrirla: un círculo de 28 px (radial-gradient) o el botón entero.
          const abierta = boton.getAttribute('aria-expanded');
          boton.setAttribute('aria-expanded', 'true');
          const pintado = getComputedStyle(boton).backgroundImage.includes('radial-gradient') ? 28 : b.width;
          boton.setAttribute('aria-expanded', abierta);
          const circulo = b.left + (b.width - pintado) / 2;
          if (letras && letras.bottom > b.top && letras.top < b.bottom && letras.right > circulo + 0.5) out.push(`la ⓘ tapa «${antes.textContent.trim().slice(-12)}» (${Math.round(letras.right)} > ${Math.round(circulo)})`);
        }
      }
      // Iconos sin dibujo.
      for (const svg of document.querySelectorAll('svg.ic')) if (!svg.querySelector('path')?.getAttribute('d')) out.push('icono vacío');
      // Objetivos táctiles en el móvil (lo que se pulsa y no es un enlace dentro de un texto).
      if (movil) {
        for (const el of document.querySelectorAll('button, .boton, .chip, .opcion, summary, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, .navegacion a, .pastilla--viaje, #aviso-puente a, .seccion__enlace')) {
          if (!visible(el) || el.closest('.sr, .leaflet-control-container')) continue;
          if (el.matches('.enlace-ficha, .enlace-boton')) continue;
          const b = el.getBoundingClientRect();
          if (b.height < 40 || b.width < 40) out.push(`táctil pequeño ${Math.round(b.width)}×${Math.round(b.height)}: ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} «${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}»`);
        }
      }
      return [...new Set(out)];
    }, { movil });
    for (const x of r) problemas.push(`[${tema} ${ancho} ${ruta}] ${x}`);
    if (dir) await p.screenshot({ path: `${dir}/${tema}-${ancho}-${ruta.replace(/[^a-z0-9]+/gi, '_')}.png` });
  }
  await c.close();
}
await cerrar();
console.log(problemas.length ? problemas.join('\n') : 'Sin problemas');
if (problemas.length) process.exitCode = 1;
