/**
 * Mapa con Leaflet (cargado bajo demanda) y teselas de OpenStreetMap:
 * escapadas por color de tema, destinos de vuelo con su precio y el radio de búsqueda.
 */

import { LEAFLET, cargarEstilo, cargarScript } from './cdn.js?v=hosting-465dd02d9e68';
import { escaparHtml, euros } from './formato.js?v=hosting-465dd02d9e68';
import { tarjeta } from './plantillas.js?v=hosting-465dd02d9e68';
import { icono } from './iconos.js?v=hosting-465dd02d9e68';

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
  // Los controles de Leaflet vienen en inglés («Zoom in», «Layers»): en español, como el resto.
  mapa = L.map(contenedor, { preferCanvas: true, zoomControl: false });
  L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: ATRIBUCION }).addTo(mapa);
  capas = { escapadas: L.layerGroup(), vuelos: L.layerGroup(), busqueda: L.layerGroup() };
  Object.values(capas).forEach((capa) => capa.addTo(mapa));
  const selector = L.control.layers(null, { [`${icono('escapadas')} Escapadas`]: capas.escapadas, [`${icono('vuelos')} Vuelos`]: capas.vuelos }).addTo(mapa);
  const boton = selector.getContainer()?.querySelector('.leaflet-control-layers-toggle');
  if (boton) { boton.title = 'Qué enseñar en el mapa'; boton.setAttribute('aria-label', 'Qué enseñar en el mapa'); }
  // Con el teclado: al abrir la ventana de un punto, el foco va a su primer enlace o botón, y al
  // cerrarla vuelve al punto (si no, había que recorrer todos los puntos para llegar a ella).
  let origenVentana = null;
  mapa.on('popupopen', (evento) => {
    origenVentana = evento.popup._source?.getElement?.() ?? null;
    const caja = evento.popup.getElement();
    // Escape la cierra también con el foco dentro (Leaflet solo lo mira con el foco en el mapa).
    if (caja && !caja.dataset.conEscape) {
      caja.dataset.conEscape = '';
      caja.addEventListener('keydown', (tecla) => { if (tecla.key === 'Escape') { tecla.stopPropagation(); mapa.closePopup(); } });
    }
    caja?.querySelector('.leaflet-popup-content a[href], .leaflet-popup-content button')?.focus({ preventScroll: true });
  });
  mapa.on('popupclose', () => {
    if (origenVentana?.isConnected && contenedor.contains(document.activeElement ?? null)) origenVentana.focus({ preventScroll: true });
    origenVentana = null;
  });
  observador = new ResizeObserver(() => {
    mapa.invalidateSize();
    if (encuadrePendiente && contenedor.clientWidth) encuadrar(L, encuadrePendiente);
  });
  observador.observe(contenedor);
}

/** Los clics dentro de las ventanas suben hasta el documento, que los atiende como en el resto del panel. */
const ventana = (html) => `<div class="ventana-mapa">${html}</div>`;

/**
 * Un punto del mapa que se puede usar con el teclado y con lector de pantalla: recibe el foco
 * (Tab), se abre con Intro y dice qué es («Sitges: Hotel… desde 45 €»).
 */
function marcador(L, latlng, icon, etiqueta) {
  const m = L.marker(latlng, { icon, title: etiqueta, keyboard: true, riseOnHover: true });
  m.on('add', () => {
    const el = m.getElement();
    if (!el) return;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', etiqueta);
  });
  return m;
}

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
  } catch (error) {
    console.error('No se ha podido cargar Leaflet:', error);
    contenedor.innerHTML = '<p class="mapa__cargando">No se ha podido cargar el mapa. Comprueba la conexión y vuelve a intentarlo.</p>';
    return;
  }
  if (!contenedor.isConnected) return;
  const L = window.L;
  if (mapa?.getContainer() !== contenedor) crearMapa(L, contenedor);
  Object.values(capas).forEach((capa) => capa.clearLayers());

  const acento = colorCss('--acento');
  // Las del mismo sitio (unos 100 m) van en un solo marcador: si no, quedaban una encima de
  // otra y solo se podía pulsar la de arriba.
  for (const grupo of agruparPorLugar(d.escapadas)) {
    const [o] = grupo;
    const color = colorCss(`--tema-${o.temas[0]}`) || acento;
    const punto = grupo.length === 1
      ? marcador(L, [o.lugar.lat, o.lugar.lon], L.divIcon({ className: 'marcador-punto', html: `<span style="background:${color}"></span>`, iconSize: null }),
        `${o.lugar.nombre ?? 'Escapada'}: ${o.titulo}${typeof o.precio === 'number' && o.precio > 0 ? `, desde ${euros(o.precio)}` : ''}`)
      : marcador(L, [o.lugar.lat, o.lugar.lon], L.divIcon({ className: 'marcador-grupo', html: `<span>${grupo.length}</span>`, iconSize: null }),
        `${grupo.length} escapadas en ${o.lugar.nombre ?? 'este sitio'}`);
    punto.bindPopup(() => ventana(contenidoGrupo(grupo, ctx)), { minWidth: 260, maxWidth: 320 }).addTo(capas.escapadas);
  }
  for (const { oferta, total } of d.destinos) {
    const icono = L.divIcon({ className: 'marcador-precio', html: `<span>${euros(Math.round(oferta.precio))}</span>`, iconSize: null });
    const extra = total > 1 ? `<p class="ventana-mapa__nota">${total} vuelos a este destino; este es el más barato.</p>` : '';
    marcador(L, [oferta.lugar.lat, oferta.lugar.lon], icono, `Vuelo a ${oferta.lugar.nombre}: desde ${euros(oferta.precio)}`)
      .bindPopup(() => ventana(tarjeta(oferta, ctx) + extra), { minWidth: 260, maxWidth: 320 })
      .addTo(capas.vuelos);
  }
  L.circleMarker([d.punto.lat, d.punto.lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: '#111827', fillOpacity: 1 })
    // Leaflet mete el texto del tooltip con innerHTML, y el nombre puede venir del hash de la URL.
    .bindTooltip(escaparHtml(d.desde)).addTo(capas.busqueda);
  if (d.radioKm) {
    L.circle([d.punto.lat, d.punto.lon], { radius: d.radioKm * 1000, color: acento, weight: 2, fillOpacity: 0.08, interactive: false })
      .addTo(capas.busqueda);
  }
  encuadrar(L, d);
}

/** Ofertas agrupadas por sitio (coordenadas redondeadas a unos 100 m), en el orden en que llegan. */
export function agruparPorLugar(ofertas) {
  const grupos = new Map();
  for (const o of ofertas) {
    const clave = `${o.lugar.lat.toFixed(3)},${o.lugar.lon.toFixed(3)}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(o);
  }
  return [...grupos.values()];
}

/** Ventana de un marcador: la tarjeta o, si son varias, las primeras y cuántas hay. */
const MAX_EN_VENTANA = 5;
function contenidoGrupo(grupo, ctx) {
  if (grupo.length === 1) return tarjeta(grupo[0], ctx);
  const lugar = grupo[0].lugar.nombre ?? 'este sitio';
  const resto = grupo.length > MAX_EN_VENTANA ? `<p class="ventana-mapa__nota">Y ${grupo.length - MAX_EN_VENTANA} más: cierra el mapa con «Lista» para verlas todas.</p>` : '';
  return `<p class="ventana-mapa__nota"><strong>${grupo.length} escapadas en ${escaparHtml(lugar)}</strong></p>${grupo.slice(0, MAX_EN_VENTANA).map((o) => tarjeta(o, ctx)).join('')}${resto}`;
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
