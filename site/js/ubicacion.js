/**
 * Campo «Cerca de…»: autocompletado accesible (combobox) con Photon y «usar mi ubicación».
 * Al elegir un punto rellena los campos ocultos lugar/lat/lon y lanza «change» en el formulario.
 */

import { escaparHtml as esc } from './formato.js';
import { parsearPhoton, urlPhoton } from './geo.js';
import { textoAyudaUbicacion } from './plantillas.js';

const ESPERA_MS = 350;
const MIN_CARACTERES = 3;
/** Dos decimales (~1 km): suficiente para medir y no deja la posición exacta en la URL. */
const redondear = (n) => Math.round(n * 100) / 100;
const cache = new Map();

export function activarUbicacion(formulario, origen) {
  const texto = formulario.querySelector('#lugar-texto');
  if (!texto) return;
  const lista = formulario.querySelector('#lugar-sugerencias');
  const ayuda = formulario.querySelector('#ubicacion-ayuda');
  const { lugar, lat, lon } = formulario.elements;
  let sugerencias = [];
  let activa = -1;
  let temporizador = null;
  let controlador = null;

  function cerrar() {
    lista.hidden = true;
    activa = -1;
    texto.setAttribute('aria-expanded', 'false');
    texto.removeAttribute('aria-activedescendant');
  }

  function pintar() {
    lista.innerHTML = sugerencias.map((s, i) => `<li id="lugar-opcion-${i}" role="option" aria-selected="${i === activa}" data-indice="${i}">${esc(s.nombre)}${s.detalle ? `<span class="suave"> · ${esc(s.detalle)}</span>` : ''}</li>`).join('');
    lista.hidden = sugerencias.length === 0;
    texto.setAttribute('aria-expanded', String(!lista.hidden));
    if (activa >= 0) texto.setAttribute('aria-activedescendant', `lugar-opcion-${activa}`);
    else texto.removeAttribute('aria-activedescendant');
  }

  function fijar(punto) {
    lugar.value = punto?.nombre ?? '';
    lat.value = punto ? punto.lat.toFixed(4) : '';
    lon.value = punto ? punto.lon.toFixed(4) : '';
    texto.value = punto?.nombre ?? '';
    ayuda.textContent = textoAyudaUbicacion(punto, origen);
    cerrar();
    formulario.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function buscar(consulta) {
    controlador?.abort();
    controlador = new AbortController();
    try {
      if (!cache.has(consulta)) {
        const respuesta = await fetch(urlPhoton(consulta, origen), { signal: controlador.signal });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        cache.set(consulta, parsearPhoton(await respuesta.json()));
      }
      sugerencias = cache.get(consulta);
      activa = -1;
      pintar();
      if (!sugerencias.length) ayuda.textContent = 'No se ha encontrado ningún lugar con ese nombre.';
    } catch (error) {
      if (error.name !== 'AbortError') ayuda.textContent = 'No se ha podido buscar el lugar. Inténtalo de nuevo en un momento.';
    }
  }

  texto.addEventListener('input', () => {
    clearTimeout(temporizador);
    const consulta = texto.value.trim();
    if (!consulta && lat.value) return fijar(null);
    if (consulta.length < MIN_CARACTERES) return cerrar();
    temporizador = setTimeout(() => buscar(consulta), ESPERA_MS);
  });

  texto.addEventListener('keydown', (evento) => {
    const total = sugerencias.length;
    if (evento.key === 'Escape') return cerrar();
    if (lista.hidden || !total) return;
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      activa = (activa + (evento.key === 'ArrowDown' ? 1 : -1) + total) % total;
      pintar();
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      fijar(sugerencias[Math.max(activa, 0)]);
    }
  });

  texto.addEventListener('blur', cerrar);
  lista.addEventListener('mousedown', (evento) => evento.preventDefault());
  lista.addEventListener('click', (evento) => {
    const opcion = evento.target.closest('[data-indice]');
    if (opcion) fijar(sugerencias[Number(opcion.dataset.indice)]);
  });

  formulario.querySelector('[data-mi-ubicacion]')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      ayuda.textContent = 'Este navegador no permite obtener tu ubicación.';
      return;
    }
    ayuda.textContent = 'Obteniendo tu ubicación…';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fijar({ nombre: 'Tu ubicación', lat: redondear(coords.latitude), lon: redondear(coords.longitude) }),
      () => { ayuda.textContent = 'No se ha podido obtener tu ubicación (permiso denegado o sin señal).'; },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  });
}
