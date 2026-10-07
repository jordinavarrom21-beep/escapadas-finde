/**
 * Configuración del vigilante (config/ajustes.json): se valida al arrancar para
 * fallar pronto y con un mensaje claro, en vez de romperse a mitad del escaneo.
 * El significado de cada campo está en LEEME.md y docs/CONTRATOS.md.
 */
import { problemasDrive } from './drive.js';
import { problemasGoogleAds } from './google-ads.js';
import { problemasLegal } from './legal.js';
import { cargarJson } from './almacen.js';

const esObjeto = (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const esTexto = (valor) => typeof valor === 'string' && valor.trim() !== '';
const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor);
const esPositivo = (valor) => esNumero(valor) && valor > 0;
const enRango = (valor, min, max) => esNumero(valor) && valor >= min && valor <= max;
const esEnteroDesde = (valor, min) => Number.isInteger(valor) && valor >= min;
const esHora = (valor) => typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
const esFecha = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
const esListaDeTextos = (valor) => Array.isArray(valor) && valor.every(esTexto);

/**
 * Una dirección pública de la web: https con un dominio de verdad («https://sindominio» o
 * «https://» no valen). En local, http://localhost o 127.0.0.1 para probar.
 */
export function esUrlPublica(valor) {
  if (typeof valor !== 'string' || !URL.canParse(valor)) return false;
  const { protocol, hostname } = new URL(valor);
  if (['localhost', '127.0.0.1'].includes(hostname)) return protocol === 'http:' || protocol === 'https:';
  return protocol === 'https:' && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(hostname);
}

/** Recolector de problemas: `exigir(condición, mensaje)` apunta el mensaje si no se cumple. */
function lista() {
  const problemas = [];
  return { problemas, exigir: (condicion, mensaje) => { if (!condicion) problemas.push(mensaje); } };
}

function problemasOrigen(origen) {
  if (!esObjeto(origen)) return ['origen debe ser un objeto {nombre, lat, lon}'];
  const { problemas, exigir } = lista();
  exigir(esTexto(origen.nombre), 'origen.nombre debe ser el nombre del punto de partida');
  exigir(enRango(origen.lat, -90, 90), `origen.lat debe ser un número entre -90 y 90 (ahora: ${origen.lat})`);
  exigir(enRango(origen.lon, -180, 180), `origen.lon debe ser un número entre -180 y 180 (ahora: ${origen.lon})`);
  // (0, 0) está en el golfo de Guinea: casi siempre es un campo que se quedó sin rellenar.
  exigir(!(origen.lat === 0 && origen.lon === 0), 'origen.lat y origen.lon son (0, 0): pon las coordenadas de tu ciudad');
  return problemas;
}

function problemasVuelos(vuelos) {
  if (!esObjeto(vuelos)) return ['vuelos debe ser un objeto'];
  const { problemas, exigir } = lista();
  exigir(esListaDeTextos(vuelos.aeropuertos) && vuelos.aeropuertos.length > 0,
    'vuelos.aeropuertos debe ser una lista de códigos IATA, p. ej. ["BCN"]');
  const noIata = (Array.isArray(vuelos.aeropuertos) ? vuelos.aeropuertos : []).filter((a) => typeof a === 'string' && !/^[A-Z]{3}$/.test(a));
  exigir(!noIata.length, `vuelos.aeropuertos: «${noIata.join('», «')}» no son códigos IATA (tres letras en mayúsculas, p. ej. "BCN")`);
  exigir(esEnteroDesde(vuelos.findes, 1), `vuelos.findes debe ser un número entero de findes a vigilar (ahora: ${vuelos.findes})`);
  exigir(esPositivo(vuelos.precioMax), `vuelos.precioMax debe ser un número de euros mayor que 0 (ahora: ${vuelos.precioMax})`);
  exigir(esNumero(vuelos.pausaEntrePeticionesMs) && vuelos.pausaEntrePeticionesMs >= 0,
    'vuelos.pausaEntrePeticionesMs debe ser un número de milisegundos mayor o igual que 0');
  if (!Array.isArray(vuelos.patrones) || vuelos.patrones.length === 0) {
    problemas.push('vuelos.patrones debe ser una lista con al menos un patrón {id, nombre, salida, vuelta}');
  } else {
    for (const [i, patron] of vuelos.patrones.entries()) {
      exigir(esObjeto(patron) && esTexto(patron.id) && Number.isInteger(patron.salida) && Number.isInteger(patron.vuelta),
        `vuelos.patrones[${i}] debe ser {id, nombre, salida, vuelta} con salida y vuelta en días desde el viernes`);
    }
  }
  if (vuelos.horarioIdeal !== undefined) {
    const horario = vuelos.horarioIdeal;
    exigir(esObjeto(horario) && esHora(horario.salidaDesde) && esHora(horario.vueltaDesde)
      && esListaDeTextos(horario.aeropuertos ?? []),
    'vuelos.horarioIdeal debe ser {salidaDesde: "HH:MM", vueltaDesde: "HH:MM", aeropuertos: [...]}');
    const noIataHorario = (Array.isArray(horario?.aeropuertos) ? horario.aeropuertos : []).filter((a) => typeof a === 'string' && !/^[A-Z]{3}$/.test(a));
    exigir(!noIataHorario.length, `vuelos.horarioIdeal.aeropuertos: «${noIataHorario.join('», «')}» no son códigos IATA (tres letras en mayúsculas)`);
  }
  return problemas;
}

function problemasPuentes(puentes) {
  if (!esObjeto(puentes)) return ['puentes debe ser un objeto {comunidad, festivosLocales}'];
  const { problemas, exigir } = lista();
  exigir(esTexto(puentes.comunidad), 'puentes.comunidad debe ser el código de la comunidad, p. ej. "ES-CT"');
  const locales = puentes.festivosLocales ?? [];
  if (!Array.isArray(locales)) {
    problemas.push('puentes.festivosLocales debe ser una lista de {fecha, nombre}');
  } else {
    for (const [i, festivo] of locales.entries()) {
      const fechaValida = esFecha(festivo?.fecha) || /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(festivo?.fecha ?? '');
      exigir(esObjeto(festivo) && fechaValida && esTexto(festivo.nombre),
        `puentes.festivosLocales[${i}] debe ser {fecha: "AAAA-MM-DD" (ese año) o "MM-DD" (todos los años), nombre}`);
    }
  }
  return problemas;
}

function problemasCoche(coche) {
  if (!esObjeto(coche)) return ['coche debe ser un objeto'];
  const { problemas, exigir } = lista();
  for (const campo of ['maxKmLineaRecta', 'velocidadMediaKmh', 'consumoL100km', 'precioLitro']) {
    exigir(esPositivo(coche[campo]), `coche.${campo} debe ser un número mayor que 0 (ahora: ${coche[campo]})`);
  }
  exigir(esTexto(coche.carburante), 'coche.carburante debe ser el tipo de carburante, p. ej. "gasolina95"');
  return problemas;
}

function problemasFuentes(fuentes) {
  if (!esObjeto(fuentes)) return ['fuentes debe ser un objeto {idDeLaFuente: {activa, intervaloMin}}'];
  const { problemas, exigir } = lista();
  for (const [id, config] of Object.entries(fuentes)) {
    if (!esObjeto(config)) {
      problemas.push(`fuentes.${id} debe ser un objeto {activa, intervaloMin}`);
      continue;
    }
    exigir(config.activa === undefined || typeof config.activa === 'boolean',
      `fuentes.${id}.activa debe ser true o false`);
    exigir(config.intervaloMin === undefined || esPositivo(config.intervaloMin),
      `fuentes.${id}.intervaloMin debe ser un número de minutos mayor que 0`);
    exigir(config.retencionDias === undefined || esPositivo(config.retencionDias),
      `fuentes.${id}.retencionDias debe ser un número de días mayor que 0`);
  }
  return problemas;
}

function problemasEmails(emails) {
  if (!esObjeto(emails)) return ['emails debe ser un objeto {resumen, chollazos, vigilados, fuenteCaidaHoras}'];
  const { problemas, exigir } = lista();
  const { resumen, chollazos, vigilados } = emails;
  if (!esObjeto(resumen)) {
    problemas.push('emails.resumen debe ser un objeto {activo, diaSemana, hora}');
  } else {
    exigir(typeof resumen.activo === 'boolean', 'emails.resumen.activo debe ser true o false');
    exigir(esEnteroDesde(resumen.diaSemana, 0) && resumen.diaSemana <= 6,
      `emails.resumen.diaSemana debe ser un día de la semana, de 0 (domingo) a 6 (ahora: ${resumen.diaSemana})`);
    exigir(enRango(resumen.hora, 0, 23), `emails.resumen.hora debe ser una hora entre 0 y 23 (ahora: ${resumen.hora})`);
  }
  if (!esObjeto(chollazos)) {
    problemas.push('emails.chollazos debe ser un objeto {activo, maxPorDia, vueloMax, escapadaNocheMax, puntuacionMin}');
  } else {
    exigir(typeof chollazos.activo === 'boolean', 'emails.chollazos.activo debe ser true o false');
    exigir(esEnteroDesde(chollazos.maxPorDia, 0), 'emails.chollazos.maxPorDia debe ser un número entero de emails al día');
    for (const campo of ['vueloMax', 'escapadaNocheMax']) {
      exigir(esPositivo(chollazos[campo]), `emails.chollazos.${campo} debe ser un número de euros mayor que 0`);
    }
    exigir(enRango(chollazos.puntuacionMin, 0, 100), 'emails.chollazos.puntuacionMin debe ser un número entre 0 y 100');
  }
  exigir(esObjeto(vigilados) && typeof vigilados.activo === 'boolean', 'emails.vigilados debe ser un objeto {activo}');
  exigir(esPositivo(emails.fuenteCaidaHoras), 'emails.fuenteCaidaHoras debe ser un número de horas mayor que 0');
  return problemas;
}

function problemasPreferencias(preferencias) {
  if (preferencias === undefined) return [];
  if (!esObjeto(preferencias)) return ['preferencias debe ser un objeto'];
  return ['temasFavoritos', 'evitarTemas', 'evitarDestinos']
    .filter((campo) => preferencias[campo] !== undefined && !esListaDeTextos(preferencias[campo]))
    .map((campo) => `preferencias.${campo} debe ser una lista de textos`);
}

/**
 * Lista de problemas de la configuración (vacía si es válida). Comprueba lo que el
 * resto del código da por hecho; los campos opcionales solo se miran si están.
 * @param {object} ajustes
 * @returns {string[]}
 */
export function validarAjustes(ajustes) {
  if (!esObjeto(ajustes)) return ['la configuración no es un objeto'];
  const { problemas, exigir } = lista();
  problemas.push(...problemasOrigen(ajustes.origen));
  exigir(ajustes.panelUrl == null || !/^https?:\/\//.test(ajustes.panelUrl) || esUrlPublica(ajustes.panelUrl),
    `panelUrl debe ser la dirección completa de la web, p. ej. "https://escapadasfinde.com/", o null (ahora: ${ajustes.panelUrl})`);
  exigir(esPositivo(ajustes.retencionDias),
    `retencionDias debe ser un número de días mayor que 0 (ahora: ${ajustes.retencionDias})`);
  problemas.push(...problemasVuelos(ajustes.vuelos));
  problemas.push(...problemasPuentes(ajustes.puentes));
  problemas.push(...problemasCoche(ajustes.coche));
  problemas.push(...problemasFuentes(ajustes.fuentes));
  problemas.push(...problemasEmails(ajustes.emails));
  exigir(esEnteroDesde(ajustes.viajeros, 1),
    `viajeros debe ser un número entero de personas mayor o igual que 1 (ahora: ${ajustes.viajeros})`);
  exigir(ajustes.panelUrl == null || /^https?:\/\//.test(ajustes.panelUrl), 'panelUrl debe ser una URL http(s) o null');
  problemas.push(...problemasPreferencias(ajustes.preferencias));
  problemas.push(...problemasGoogleAds(ajustes.googleAds));
  problemas.push(...problemasDrive(ajustes.travelpayoutsDrive));
  problemas.push(...problemasLegal(ajustes.legal));
  return problemas;
}

/**
 * Lee y valida la configuración. Lanza un error con todos los problemas juntos en
 * vez de dejar que el escaneo reviente más adelante con un `undefined`.
 * @param {string} ruta
 */
export function cargarAjustes(ruta) {
  let ajustes;
  try {
    ajustes = cargarJson(ruta);
  } catch (error) {
    throw new Error(`No se puede leer la configuración ${ruta}: ${error.message}`, { cause: error });
  }
  const problemas = validarAjustes(ajustes);
  if (problemas.length) throw new Error(`Configuración no válida en ${ruta}:\n  - ${problemas.join('\n  - ')}`);
  return ajustes;
}
