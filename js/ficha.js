/**
 * Ficha de una oferta en un <dialog> modal, con la gráfica del historial
 * (Chart.js se carga solo la primera vez que hace falta).
 */

import { CHART, cargarScript } from './cdn.js?v=hosting-465dd02d9e68';
import { etiquetaDia } from './fechas.js?v=hosting-465dd02d9e68';
import { euros } from './formato.js?v=hosting-465dd02d9e68';
import { contenidoFicha } from './plantillas.js?v=hosting-465dd02d9e68';

let grafica = null;

/** Mediana: el «precio típico» de la oferta, sin que un día raro lo mueva. */
export function mediana(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

const colorCss = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

async function dibujarGrafica(lienzo, serie) {
  try {
    await cargarScript(CHART);
  } catch (error) {
    console.error('No se ha podido cargar Chart.js:', error);
    lienzo.closest('.ficha__grafica')?.replaceWith(Object.assign(document.createElement('p'), {
      className: 'suave', textContent: 'No se ha podido cargar la gráfica.',
    }));
    return;
  }
  if (!lienzo.isConnected) return;
  grafica?.destroy();
  const [acento, suave, borde, chollo, superficie] = ['--acento', '--texto-suave', '--borde', '--chollo', '--superficie'].map(colorCss);
  const precios = serie.map(([, precio]) => precio);
  const minimo = Math.min(...precios);
  const tipico = mediana(precios);
  // El día más barato, marcado (punto grande con anillo del color del fondo); el resto, pequeños.
  const radios = precios.map((p, i) => (p === minimo && precios.indexOf(p) === i ? 6 : i === precios.length - 1 ? 4 : 2.5));
  grafica = new window.Chart(lienzo, {
    type: 'line',
    data: {
      labels: serie.map(([dia]) => etiquetaDia(dia)),
      datasets: [
        {
          label: 'Precio', data: precios, borderColor: acento, backgroundColor: precios.map((p) => (p === minimo ? chollo : acento)),
          borderWidth: 2, pointRadius: radios, pointHoverRadius: 7, pointBorderColor: superficie, pointBorderWidth: 2, tension: 0.25,
        },
        {
          label: 'Precio típico', data: precios.map(() => tipico), borderColor: suave, borderDash: [5, 4], borderWidth: 1.5,
          pointRadius: 0, pointHoverRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      // Al pasar por encima (o tocar), el día entero: su precio y el típico.
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => (c.datasetIndex === 1 ? `Típico: ${euros(c.parsed.y)}` : `${euros(c.parsed.y)}${c.parsed.y === minimo ? ' · el más bajo' : ''}`),
          },
        },
      },
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
