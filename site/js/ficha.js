/**
 * Ficha de una oferta en un <dialog> modal, con la gráfica del historial
 * (Chart.js se carga solo la primera vez que hace falta).
 */

import { CHART, cargarScript } from './cdn.js';
import { etiquetaDia } from './fechas.js';
import { euros } from './formato.js';
import { contenidoFicha } from './plantillas.js';

let grafica = null;

const colorCss = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

async function dibujarGrafica(lienzo, serie) {
  try {
    await cargarScript(CHART);
  } catch {
    lienzo.closest('.ficha__grafica')?.replaceWith(Object.assign(document.createElement('p'), {
      className: 'suave', textContent: 'No se ha podido cargar la gráfica.',
    }));
    return;
  }
  if (!lienzo.isConnected) return;
  grafica?.destroy();
  const [acento, suave, borde] = ['--acento', '--texto-suave', '--borde'].map(colorCss);
  grafica = new window.Chart(lienzo, {
    type: 'line',
    data: {
      labels: serie.map(([dia]) => etiquetaDia(dia)),
      datasets: [{ data: serie.map(([, precio]) => precio), borderColor: acento, backgroundColor: acento, pointRadius: 3, tension: 0.25 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => euros(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: suave, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: suave, callback: (valor) => euros(valor) }, grid: { color: borde } },
      },
    },
  });
}

/** Rellena y abre la ficha. `ctx` es el mismo contexto que usan las tarjetas. */
export function abrirFicha(dialogo, oferta, ctx) {
  dialogo.querySelector('.ficha__contenido').innerHTML = contenidoFicha(oferta, ctx);
  if (!dialogo.open) dialogo.showModal();
  dialogo.querySelector('.ficha__contenido').scrollTop = 0;
  const serie = ctx.historial?.[oferta.id];
  const lienzo = dialogo.querySelector('#ficha-grafica');
  if (lienzo && serie?.length >= 2) dibujarGrafica(lienzo, serie);
}

export function liberarFicha() {
  grafica?.destroy();
  grafica = null;
}
