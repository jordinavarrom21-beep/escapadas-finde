/**
 * Calendario de «Fecha de entrada» y «Fecha de salida» que se abre en la misma página (sin ir a
 * otra vista): el primer toque elige la entrada y el segundo la salida. Los días que ya pasaron
 * no se pueden elegir y los de los puentes van marcados. Se maneja con el teclado (flechas,
 * Inicio/Fin de semana, Re Pág/Av Pág de mes y Escape) y dice en voz alta qué toca elegir.
 *
 * La caja es cualquier elemento [data-fechas] con sus dos campos ([data-fechas-campo="entrada"]
 * y [data-fechas-campo="salida"]) y un [data-calendario] donde se pinta. La pintan el buscador
 * del Inicio (vistas-portada.js) y la barra de fechas de Explorar y Buscar (vistas-comun.js);
 * qué pasa al elegir lo decide quien conecta el calendario (app.js).
 */

import { diaSemana, diasEntre, etiquetaDia, sumarDias } from './fechas.js?v=hosting-465dd02d9e68';
import { contar, escaparHtml as esc } from './formato.js?v=hosting-465dd02d9e68';
import { icono } from './iconos.js?v=hosting-465dd02d9e68';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const CABECERA = [['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo']];
/** Hasta cuándo se puede elegir: el mes actual y los once siguientes. */
export const MESES_ADELANTE = 12;
/** Cómo se llaman las dos fechas en cada pestaña: en Vuelos, «Ida / Vuelta»; en Planes, «Desde / Hasta». */
export const ROTULOS_FECHAS = { vuelos: ['Ida', 'Vuelta'], actividades: ['Desde', 'Hasta'] };
const ROTULOS_DEFECTO = ['Fecha de entrada', 'Fecha de salida'];
/** Un periodo de búsqueda llega como mucho a 8 semanas después de la entrada. */
export const MAXIMO_DIAS = 56;
/** Hasta aquí son las noches de un viaje; más, un periodo en el que buscar («Del 17 oct al 25 dic»). */
const MAXIMO_NOCHES_VIAJE = 7;
/** A partir de este ancho de pantalla se ven dos meses. */
const DOS_MESES = '(min-width: 720px)';

export const mesDe = (dia) => dia.slice(0, 7);

/** '2026-12' + 1 → '2027-01'. */
export function sumarMeses(mes, n) {
  const [anio, numero] = mes.split('-').map(Number);
  const total = anio * 12 + numero - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** «viernes 16 de octubre». */
export function nombreDia(dia) {
  const [, mes, numero] = dia.split('-').map(Number);
  return `${DIAS[diaSemana(dia)]} ${numero} de ${MESES[mes - 1]}`;
}

/** Las semanas de un mes ('YYYY-MM'), de lunes a domingo, con null en los huecos. */
export function semanasDelMes(mes) {
  const primero = `${mes}-01`;
  const celdas = Array((diaSemana(primero) + 6) % 7).fill(null);
  for (let dia = primero; mesDe(dia) === mes; dia = sumarDias(dia, 1)) celdas.push(dia);
  while (celdas.length % 7) celdas.push(null);
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
}

/**
 * Lo que pasa al tocar un día. Eligiendo la salida, un día igual o posterior a la entrada la
 * cierra (el mismo día es un solo día); uno anterior pasa a ser la nueva entrada. Eligiendo la
 * entrada, empieza de nuevo y luego se pide la salida.
 * @returns {{entrada: string, salida: string, editando: 'entrada'|'salida', completo: boolean}}
 */
export function elegirDia(sel, dia) {
  if (sel.editando === 'salida' && sel.entrada && dia >= sel.entrada && dia <= sumarDias(sel.entrada, MAXIMO_DIAS)) {
    return { entrada: sel.entrada, salida: dia, editando: 'entrada', completo: true };
  }
  return { entrada: dia, salida: '', editando: 'salida', completo: false };
}

/** Con la entrada y sin salida, la salida son las noches de tu viaje después. */
export function completarSalida(sel, noches = 2) {
  if (!sel.entrada || sel.salida) return sel;
  return { ...sel, salida: sumarDias(sel.entrada, Math.max(1, Number(noches) || 2)), completo: true };
}

const diaMes = (iso) => etiquetaDia(iso).split(' ').slice(1).join(' ');

/**
 * «2 noches», «Un día» o nada: lo que se dice junto a las dos fechas. Con más de una semana no son
 * las noches del viaje sino el periodo en el que buscar: «Del 17 oct al 25 dic» («69 noches» al
 * lado de «Tu viaje: 2 noches» confundía).
 */
export function textoNoches(entrada, salida) {
  if (!entrada || !salida) return '';
  const noches = diasEntre(entrada, salida);
  if (noches > MAXIMO_NOCHES_VIAJE) return `Del ${diaMes(entrada)} al ${diaMes(salida)}`;
  return noches > 0 ? contar(noches, 'noche') : 'Un día';
}

/** Los días de los puentes ({desde, hasta, nombre}) para marcarlos: día → nombre del puente. */
export function diasDePuentes(puentes = []) {
  const dias = new Map();
  for (const p of puentes) {
    if (!p?.desde || !p?.hasta || p.hasta < p.desde) continue;
    for (let dia = p.desde; dia <= p.hasta; dia = sumarDias(dia, 1)) dias.set(dia, p.nombre);
  }
  return dias;
}

/** Qué se dice arriba del calendario: qué toca elegir o lo elegido. */
function textoPaso(sel, rotulos = ROTULOS_DEFECTO) {
  if (rotulos === ROTULOS_DEFECTO) {
    if (sel.entrada && sel.salida) return `Entrada ${etiquetaDia(sel.entrada)} · Salida ${etiquetaDia(sel.salida)}`;
    if (sel.editando === 'salida' && sel.entrada) return `Entrada ${etiquetaDia(sel.entrada)}. Ahora, la fecha de salida`;
    return 'Elige la fecha de entrada';
  }
  const [uno, otro] = rotulos;
  if (sel.entrada && sel.salida) return `${uno}: ${etiquetaDia(sel.entrada)} · ${otro}: ${etiquetaDia(sel.salida)}`;
  if (sel.editando === 'salida' && sel.entrada) return `${uno}: ${etiquetaDia(sel.entrada)}. Ahora, «${otro}»`;
  return `Elige «${uno}»`;
}

/**
 * El calendario: barra con los meses, la cuadrícula de días y «Listo».
 * @param {{entrada: string, salida: string, editando: string}} sel
 * @param {{hoy: string, mes: string, meses?: number, foco?: string, puentes?: Map<string, string>, vista?: string}} op
 */
export function htmlCalendario(sel, { hoy, mes, meses = 1, foco = '', puentes = new Map(), previo = '', rotulos = ROTULOS_DEFECTO }) {
  const primero = mesDe(hoy);
  const ultimo = sumarMeses(primero, MESES_ADELANTE - 1);
  const hasta = sel.salida || (sel.editando === 'salida' && previo && sel.entrada && previo >= sel.entrada ? previo : '');
  const enRango = (dia) => sel.entrada && hasta && dia > sel.entrada && dia < hasta;
  const celda = (dia) => {
    if (!dia) return '<td></td>';
    const pasado = dia < hoy;
    const clases = ['calendario__dia'];
    const extra = [];
    if (dia === hoy) { clases.push('calendario__dia--hoy'); extra.push('hoy'); }
    if (puentes.has(dia)) { clases.push('calendario__dia--puente'); extra.push(`puente: ${puentes.get(dia)}`); }
    if (dia === sel.entrada) { clases.push('calendario__dia--entrada'); extra.push('fecha de entrada'); }
    if (dia === sel.salida) { clases.push('calendario__dia--salida'); extra.push('fecha de salida'); }
    if (enRango(dia)) clases.push(sel.salida ? 'calendario__dia--rango' : 'calendario__dia--previo');
    if (diaSemana(dia) === 0 || diaSemana(dia) === 6) clases.push('calendario__dia--finde');
    // Eligiendo la salida, más de 8 semanas después de la entrada no se puede.
    const lejos = sel.editando === 'salida' && sel.entrada && !sel.salida && dia > sumarDias(sel.entrada, MAXIMO_DIAS);
    if (lejos) extra.push('más de 8 semanas después de la entrada');
    const elegido = dia === sel.entrada || dia === sel.salida || (sel.salida && enRango(dia));
    const etiqueta = `${nombreDia(dia)}${extra.length ? `, ${extra.join(', ')}` : ''}`;
    return `<td${elegido || enRango(dia) ? ' class="en-rango"' : ''}><button type="button" class="${clases.join(' ')}" data-dia="${dia}" aria-label="${esc(etiqueta)}" aria-pressed="${Boolean(elegido)}" tabindex="${dia === foco ? 0 : -1}"${pasado || lejos ? ' disabled' : ''}>${Number(dia.slice(8))}</button></td>`;
  };
  const tabla = (m) => {
    const [anio, numero] = m.split('-').map(Number);
    return `<table class="calendario__mes">
      <caption>${MESES[numero - 1]} ${anio}</caption>
      <thead><tr>${CABECERA.map(([letra, nombre]) => `<th scope="col" abbr="${nombre}">${letra}</th>`).join('')}</tr></thead>
      <tbody>${semanasDelMes(m).map((semana) => `<tr>${semana.map(celda).join('')}</tr>`).join('')}</tbody>
    </table>`;
  };
  const visibles = Array.from({ length: meses }, (_, i) => sumarMeses(mes, i)).filter((m) => m <= ultimo);
  return `<div class="calendario__barra">
    <button type="button" class="boton-icono calendario__flecha" data-cal-mes="-1" aria-label="Mes anterior"${mes <= primero ? ' disabled' : ''}>${icono('atras')}</button>
    <p class="calendario__paso" aria-live="polite">${esc(textoPaso(sel, rotulos))}</p>
    <button type="button" class="boton-icono calendario__flecha" data-cal-mes="1" aria-label="Mes siguiente"${visibles.at(-1) >= ultimo ? ' disabled' : ''}>${icono('flecha')}</button>
  </div>
  <div class="calendario__meses" style="--meses:${visibles.length}">${visibles.map(tabla).join('')}</div>
  <div class="calendario__pie">
    <button type="button" class="boton boton--primario boton--mini" data-cal-listo>Listo</button>
  </div>`;
}

// ── En la página ─────────────────────────────────────────────────────────────

/** Lo que se está eligiendo en cada caja abierta (se pierde al repintarla, como debe ser). */
const estados = new WeakMap();
let opcionesGlobales = null;

const campos = (caja) => caja.querySelectorAll('[data-fechas-campo]');
const panel = (caja) => caja.querySelector('[data-fechas-panel]');

/** Pinta los dos campos y el resumen con lo elegido (sin repintar la caja entera). */
export function pintarCampos(caja, { entrada = '', salida = '' }) {
  caja.dataset.entrada = entrada;
  caja.dataset.salida = salida;
  for (const campo of campos(caja)) {
    const dia = campo.dataset.fechasCampo === 'entrada' ? entrada : salida;
    const valor = campo.querySelector('.fechas__valor');
    if (!valor) continue;
    valor.textContent = dia ? etiquetaDia(dia) : 'Añadir fecha';
    valor.classList.toggle('fechas__valor--vacio', !dia);
  }
  const resumen = caja.querySelector('[data-fechas-noches]');
  if (resumen) resumen.textContent = textoNoches(entrada, salida);
}

function pintar(caja, { enfocar = false } = {}) {
  const sel = estados.get(caja);
  const destino = caja.querySelector('[data-calendario]');
  if (!sel || !destino) return;
  const { hoy, puentes } = opcionesGlobales.contexto();
  const meses = matchMedia(DOS_MESES).matches && !caja.matches('[data-fechas-un-mes]') ? 2 : 1;
  const rotulos = ROTULOS_FECHAS[caja.dataset.vista] ?? ROTULOS_DEFECTO;
  destino.innerHTML = htmlCalendario(sel, { hoy, mes: sel.mes, meses, foco: sel.foco, puentes: diasDePuentes(puentes), previo: sel.previo, rotulos });
  for (const campo of campos(caja)) campo.classList.toggle('fechas__campo--activo', campo.dataset.fechasCampo === sel.editando);
  if (enfocar) destino.querySelector(`[data-dia="${sel.foco}"]`)?.focus({ preventScroll: true });
}

/** Abre el calendario de `caja` para elegir la entrada o la salida. */
export function abrirCalendario(caja, editando = 'entrada') {
  if (!opcionesGlobales) return;
  // Solo uno abierto a la vez.
  document.querySelectorAll('[data-fechas].fechas--abierta').forEach((otra) => { if (otra !== caja) cerrarCalendario(otra); });
  const { hoy } = opcionesGlobales.contexto();
  const entrada = caja.dataset.entrada >= hoy ? caja.dataset.entrada : '';
  const salida = entrada && caja.dataset.salida >= entrada ? caja.dataset.salida : '';
  const modo = editando === 'salida' && entrada ? 'salida' : 'entrada';
  const foco = (modo === 'salida' ? salida || entrada : entrada) || hoy;
  estados.set(caja, { entrada, salida, editando: modo, foco, mes: mesDe(foco), inicial: { entrada, salida }, previo: '' });
  panel(caja).hidden = false;
  caja.classList.add('fechas--abierta');
  for (const campo of campos(caja)) campo.setAttribute('aria-expanded', 'true');
  pintar(caja, { enfocar: true });
  // En el móvil, que se vea el calendario entero.
  panel(caja).scrollIntoView?.({ block: 'nearest' });
}

/**
 * Cierra el calendario. Con `aplicar`, lo elegido vale: si solo hay entrada, la salida son las
 * noches de tu viaje después; si no ha cambiado nada, no pasa nada.
 */
export function cerrarCalendario(caja, { aplicar = false, enfocar = null } = {}) {
  const sel = estados.get(caja);
  estados.delete(caja);
  const contenedor = panel(caja);
  if (contenedor) contenedor.hidden = true;
  caja.classList.remove('fechas--abierta');
  for (const campo of campos(caja)) {
    campo.setAttribute('aria-expanded', 'false');
    campo.classList.remove('fechas__campo--activo');
  }
  const destino = caja.querySelector('[data-calendario]');
  if (destino) destino.innerHTML = '';
  if (enfocar) caja.querySelector(`[data-fechas-campo="${enfocar}"]`)?.focus();
  if (!aplicar || !sel?.entrada) return;
  const final = completarSalida(sel, opcionesGlobales.contexto().noches);
  if (final.entrada === sel.inicial.entrada && final.salida === sel.inicial.salida) return;
  pintarCampos(caja, final);
  opcionesGlobales.alElegir(caja, { entrada: final.entrada, salida: final.salida });
}

function tocarDia(caja, dia) {
  const sel = estados.get(caja);
  const nuevo = elegirDia(sel, dia);
  if (nuevo.completo) {
    estados.set(caja, { ...sel, ...nuevo });
    cerrarCalendario(caja, { aplicar: true, enfocar: 'salida' });
    return;
  }
  estados.set(caja, { ...sel, ...nuevo, foco: dia, previo: '' });
  pintarCampos(caja, nuevo);
  pintar(caja, { enfocar: true });
}

function moverFoco(caja, dias) {
  const sel = estados.get(caja);
  const { hoy } = opcionesGlobales.contexto();
  const limite = sumarDias(`${sumarMeses(mesDe(hoy), MESES_ADELANTE)}-01`, -1);
  let foco = sumarDias(sel.foco, dias);
  if (foco < hoy) foco = hoy;
  if (foco > limite) foco = limite;
  const meses = matchMedia(DOS_MESES).matches && !caja.matches('[data-fechas-un-mes]') ? 2 : 1;
  let { mes } = sel;
  if (mesDe(foco) < mes) mes = mesDe(foco);
  if (mesDe(foco) > sumarMeses(mes, meses - 1)) mes = sumarMeses(mesDe(foco), 1 - meses);
  estados.set(caja, { ...sel, foco, mes, previo: sel.editando === 'salida' ? foco : '' });
  pintar(caja, { enfocar: true });
}

/**
 * Conecta los calendarios de toda la página (delegando en `document`, así valen también los
 * que se pintan después).
 * @param {{contexto: () => {hoy: string, puentes: object[], noches: number}, alElegir: (caja: Element, fechas: {entrada: string, salida: string}) => void}} opciones
 */
export function conectarCalendarios(opciones) {
  opcionesGlobales = opciones;
  document.addEventListener('click', (evento) => {
    const objetivo = evento.target;
    const caja = objetivo.closest?.('[data-fechas]');
    // Un clic fuera cierra el calendario abierto, con lo elegido.
    document.querySelectorAll('[data-fechas].fechas--abierta').forEach((abierta) => {
      if (abierta !== caja && objetivo.isConnected) cerrarCalendario(abierta, { aplicar: true });
    });
    if (!caja) return;
    const campo = objetivo.closest('[data-fechas-campo]');
    if (campo) {
      const sel = estados.get(caja);
      // El mismo campo otra vez lo cierra; el otro cambia qué se elige.
      if (sel && sel.editando === campo.dataset.fechasCampo) cerrarCalendario(caja, { aplicar: true, enfocar: campo.dataset.fechasCampo });
      else if (sel && campo.dataset.fechasCampo === 'salida' && sel.entrada) {
        estados.set(caja, { ...sel, editando: 'salida', foco: sel.salida || sel.entrada });
        pintar(caja);
      } else if (sel) {
        estados.set(caja, { ...sel, editando: 'entrada', foco: sel.entrada || sel.foco });
        pintar(caja);
      } else abrirCalendario(caja, campo.dataset.fechasCampo);
      return;
    }
    if (!estados.has(caja)) return;
    const dia = objetivo.closest('[data-dia]');
    if (dia && !dia.disabled) { tocarDia(caja, dia.dataset.dia); return; }
    const mes = objetivo.closest('[data-cal-mes]');
    if (mes) {
      const sel = estados.get(caja);
      estados.set(caja, { ...sel, mes: sumarMeses(sel.mes, Number(mes.dataset.calMes)) });
      pintar(caja);
      caja.querySelector(`[data-cal-mes="${mes.dataset.calMes}"]:not(:disabled)`)?.focus();
      return;
    }
    // Para quitar las fechas está «Cualquier fecha» (y «Quitar fechas»): aquí no se repite.
    if (objetivo.closest('[data-cal-listo]')) cerrarCalendario(caja, { aplicar: true, enfocar: 'entrada' });
  });
  // Al pasar el ratón eligiendo la salida, se ve el rango que quedaría.
  document.addEventListener('mouseover', (evento) => {
    const dia = evento.target.closest?.('[data-fechas] [data-dia]');
    const caja = dia?.closest('[data-fechas]');
    const sel = caja && estados.get(caja);
    if (!sel || sel.editando !== 'salida' || !sel.entrada || sel.previo === dia.dataset.dia) return;
    for (const boton of caja.querySelectorAll('[data-dia]')) {
      const d = boton.dataset.dia;
      boton.classList.toggle('calendario__dia--previo', d > sel.entrada && d < dia.dataset.dia);
    }
  });
  document.addEventListener('keydown', (evento) => {
    const caja = evento.target.closest?.('[data-fechas]');
    if (!caja || !estados.has(caja)) return;
    if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      cerrarCalendario(caja, { enfocar: estados.get(caja).editando });
      return;
    }
    if (!evento.target.matches('[data-dia]')) return;
    const pasos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -28, PageDown: 28 };
    const dia = evento.target.dataset.dia;
    const enSemana = (diaSemana(dia) + 6) % 7;
    if (evento.key === 'Home') pasos.Home = -enSemana;
    if (evento.key === 'End') pasos.End = 6 - enSemana;
    if (!(evento.key in pasos)) return;
    evento.preventDefault();
    estados.set(caja, { ...estados.get(caja), foco: dia });
    moverFoco(caja, pasos[evento.key]);
  });
}

/**
 * Los dos campos de fecha (entrada → salida) con sus noches y, si hay fechas, «Quitar fechas»
 * (`quitar`). `resumen` sustituye a las noches (p. ej. «Fechas que ya pasaron»).
 */
export function camposFechas({ entrada = '', salida = '', idPanel, resumen = null, quitar = false, rotulos = ROTULOS_DEFECTO }) {
  const campo = (tipo, etiqueta, dia) => `<button type="button" class="fechas__campo" data-fechas-campo="${tipo}" aria-expanded="false" aria-controls="${esc(idPanel)}">
      <span class="fechas__etiqueta">${etiqueta}</span>
      <span class="fechas__valor${dia ? '' : ' fechas__valor--vacio'}">${dia ? esc(etiquetaDia(dia)) : 'Añadir fecha'}</span>
    </button>`;
  return `<div class="fechas__campos">
    ${campo('entrada', rotulos[0], entrada)}
    <span class="fechas__flecha" aria-hidden="true">${icono('flecha')}</span>
    ${campo('salida', rotulos[1], salida)}
    <span class="fechas__extra"><span class="fechas__noches" data-fechas-noches>${esc(resumen ?? textoNoches(entrada, salida))}</span>${quitar ? `<button type="button" class="enlace-boton fechas__quitar" data-fechas-rapida="" aria-label="Quitar las fechas">${icono('cerrar')}Quitar fechas</button>` : ''}</span>
  </div>`;
}
