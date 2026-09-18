/**
 * Mapa con Leaflet (cargado bajo demanda) y teselas de OpenStreetMap:
 * escapadas por color de tema, destinos de vuelo con su precio y el radio de búsqueda.
 */

import { LEAFLET, cargarEstilo, cargarScript } from './cdn.js';
import { euros } from './formato.js';
import { tarjeta } from './plantillas.js';

const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

let mapa = null;
let capas = null;
let encuadre = '';
let observador = null;
// Datos del último encuadre hecho con el contenedor sin tamaño: se repite al tenerlo.
let encuadrePendiente = null;

const colorCss = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

function crearMapa(L, contenedor) {
  destruirMapa();
  contenedor.replaceChildren();
  mapa = L.map(contenedor, { preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: ATRIBUCION }).addTo(mapa);
  capas = { escapadas: L.layerGroup(), vuelos: L.layerGroup(), busqueda: L.layerGroup() };
  Object.values(capas).forEach((capa) => capa.addTo(mapa));
  L.control.layers(null, { '🏡 Escapadas': capas.escapadas, '✈️ Vuelos': capas.vuelos }).addTo(mapa);
  observador = new ResizeObserver(() => {
    mapa.invalidateSize();
    if (encuadrePendiente && contenedor.clientWidth) encuadrar(L, encuadrePendiente);
  });
  observador.observe(contenedor);
}

/** Los clics dentro de las ventanas suben hasta el documento, que los atiende como en el resto del panel. */
const ventana = (html) => `<div class="ventana-mapa">${html}</div>`;

function encuadrar(L, d) {
  const clave = `${d.punto?.lat},${d.punto?.lon},${d.radioKm}`;
  if (clave === encuadre && !encuadrePendiente) return;
  encuadre = clave;
  encuadrePendiente = mapa.getContainer().clientWidth ? null : d;
  if (d.radioKm) {
    mapa.fitBounds(L.latLng(d.punto.lat, d.punto.lon).toBounds(d.radioKm * 2000), { padding: [16, 16] });
    return;
  }
  const puntos = (d.escapadas.length ? d.escapadas : d.destinos.map((x) => x.oferta)).map((o) => [o.lugar.lat, o.lugar.lon]);
  if (puntos.length) mapa.fitBounds(L.latLngBounds([...puntos, [d.punto.lat, d.punto.lon]]), { padding: [24, 24], maxZoom: 10 });
  else mapa.setView([d.punto.lat, d.punto.lon], 7);
}

/**
 * Pinta (o repinta) el mapa en `contenedor` con los datos de vistas.datosMapa.
 */
export async function pintarMapa(contenedor, d, ctx) {
  try {
    await Promise.all([cargarEstilo(LEAFLET.css), cargarScript(LEAFLET.js)]);
  } catch {
    contenedor.innerHTML = '<p class="mapa__cargando">No se ha podido cargar el mapa. Comprueba la conexión y vuelve a intentarlo.</p>';
    return;
  }
  if (!contenedor.isConnected) return;
  const L = window.L;
  if (mapa?.getContainer() !== contenedor) crearMapa(L, contenedor);
  Object.values(capas).forEach((capa) => capa.clearLayers());

  const acento = colorCss('--acento');
  for (const o of d.escapadas) {
    const color = colorCss(`--tema-${o.temas[0]}`) || acento;
    L.circleMarker([o.lugar.lat, o.lugar.lon], { radius: 8, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.95 })
      .bindPopup(() => ventana(tarjeta(o, ctx)), { minWidth: 260, maxWidth: 320 })
      .addTo(capas.escapadas);
  }
  for (const { oferta, total } of d.destinos) {
    const icono = L.divIcon({ className: 'marcador-precio', html: `<span>${euros(Math.round(oferta.precio))}</span>`, iconSize: null });
    const extra = total > 1 ? `<p class="ventana-mapa__nota">${total} vuelos a este destino; este es el más barato.</p>` : '';
    L.marker([oferta.lugar.lat, oferta.lugar.lon], { icon: icono, title: `${oferta.lugar.nombre}: desde ${euros(oferta.precio)}`, riseOnHover: true })
      .bindPopup(() => ventana(tarjeta(oferta, ctx) + extra), { minWidth: 260, maxWidth: 320 })
      .addTo(capas.vuelos);
  }
  L.circleMarker([d.punto.lat, d.punto.lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: '#111827', fillOpacity: 1 })
    .bindTooltip(d.desde).addTo(capas.busqueda);
  if (d.radioKm) {
    L.circle([d.punto.lat, d.punto.lon], { radius: d.radioKm * 1000, color: acento, weight: 2, fillOpacity: 0.08, interactive: false })
      .addTo(capas.busqueda);
  }
  encuadrar(L, d);
}

export function destruirMapa() {
  observador?.disconnect();
  observador = null;
  encuadrePendiente = null;
  mapa?.remove();
  mapa = null;
  capas = null;
  encuadre = '';
}
