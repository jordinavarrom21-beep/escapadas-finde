// Mide la maquetación en varios anchos: desbordes horizontales, textos cortados, cosas que se salen
// de su caja, iconos vacíos y objetivos táctiles pequeños. Guarda la parte de arriba de cada vista.
// Uso: npm run test:maquetacion (sale con error si encuentra algo). Variables: ANCHOS, RUTAS,
// TEMAS (light,dark), LISTA=1 (modo lista), FOTOS=carpeta para guardar capturas.
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
    await p.waitForTimeout(ruta === 'mapa' ? 1500 : 400);
    const r = await p.evaluate(({ movil }) => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) {
        // ¿Quién se sale?
        const culpables = [...document.querySelectorAll('body *')].filter((el) => {
          const b = el.getBoundingClientRect();
          if (!b.width) return false;
          let a = el.parentElement; // dentro de algo que se desliza no cuenta
          while (a && a !== document.body) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflowX)) return false; a = a.parentElement; }
          return b.right > vw + 1;
        }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${Math.round(el.getBoundingClientRect().right)})`);
        out.push(`scroll horizontal: ${document.documentElement.scrollWidth} > ${vw} · ${culpables.join(', ')}`);
      }
      const visible = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Texto cortado dentro de botones, chips y pastillas (sin desplazamiento intencionado).
      for (const el of document.querySelectorAll('.boton, .chip, .opcion, .pastilla, .navegacion a, .navegacion summary, .sello, .pastilla-foto, .insignia, .estado-fuentes, .seccion__enlace')) {
        if (!visible(el)) continue;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis') out.push(`texto cortado: ${el.className} «${el.textContent.trim().slice(0, 40)}» ${el.scrollWidth}>${el.clientWidth}`);
      }
      // Hijos que se salen de su caja (tarjetas, formularios, celdas).
      for (const caja of document.querySelectorAll('.tarjeta, .billete, .destacado, .buscador-finde, .filtros, .finde-celda, .puente, .vigilado, .vacio, .ficha__lateral, .ayuda-caja, .portada__texto, .explorar__filtros, .resultados__cabeza')) {
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
