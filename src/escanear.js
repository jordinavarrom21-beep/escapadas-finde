#!/usr/bin/env node
/**
 * CLI del escaneo: lee la configuración y los datos, llama al núcleo
 * (src/core/scan-pipeline.js), guarda los archivos e imprime el resumen.
 *
 * Uso: node src/escanear.js [--forzar] [--solo=<fuente>] [--sin-emails]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cache } from './cache.js';
import { cargarEstado, cargarJson, guardarJson } from './almacen.js';
import { cargarAjustes } from './ajustes.js';
import { cargarVigilados } from './vigilados.js';
import { MODULOS, escanear, urlPanel } from './core/scan-pipeline.js';
import { FUENTES } from './fuentes/index.js';

// Se reexportan para quien importaba el núcleo desde aquí.
export { MODULOS, escanear, urlPanel };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTAS = {
  ajustes: 'config/ajustes.json',
  vigilados: 'config/vigilados.json',
  estado: 'data/estado.json',
  cache: 'data/cache.json',
  historial: 'data/historial.json',
  panelOfertas: 'site/data/ofertas.json',
  panelHistorial: 'site/data/historial.json',
  panelVigilados: 'site/data/vigilados.json',
};

const USO = 'Uso: node src/escanear.js [--forzar] [--solo=<fuente>] [--sin-emails]';

/**
 * Opciones de la línea de órdenes. Un argumento que no se entiende detiene el escaneo: si
 * no, «--solo ryanair» (sin «=») se ignoraría y se consultarían todas las fuentes.
 * @param {string[]} argumentos
 * @param {string[]} [ids] fuentes que existen, para comprobar la de «--solo»
 */
export function leerOpciones(argumentos, ids = null) {
  const desconocidos = argumentos.filter((a) => !['--forzar', '--sin-emails'].includes(a) && !/^--solo=[a-z0-9-]+$/.test(a));
  if (desconocidos.length) throw new Error(`Argumento no válido: ${desconocidos.join(' ')}. ${USO}`);
  const solo = argumentos.find((a) => a.startsWith('--solo='))?.slice('--solo='.length) ?? null;
  if (solo && ids && !ids.includes(solo)) throw new Error(`No hay ninguna fuente «${solo}». Las fuentes son: ${ids.join(', ')}`);
  return { forzar: argumentos.includes('--forzar'), sinEmails: argumentos.includes('--sin-emails'), solo };
}

// Los datos corruptos no deben parar el vigilante: se prueba con la copia de la
// ejecución anterior (<ruta>.bak) y, si tampoco se puede, se avisa y se empieza de cero.
export function leerDatos(ruta, porDefecto, avisar = console.warn) {
  const nombre = path.relative(RAIZ, ruta);
  try {
    return cargarJson(ruta, porDefecto);
  } catch (error) {
    try {
      const copia = cargarJson(`${ruta}.bak`);
      avisar(`⚠️  ${nombre} no se puede leer (${error.message}); se sigue con la copia anterior (.bak)`);
      return copia;
    } catch (errorCopia) {
      avisar(`⚠️  ${nombre} no se puede leer (${error.message}) y la copia anterior tampoco (${errorCopia.message}); se empieza de cero`);
      return structuredClone(porDefecto);
    }
  }
}

/** Las webs que más nos han hecho esperar o reintentar, para verlo de un vistazo. */
function imprimirRed(red = {}) {
  const dominios = Object.entries(red)
    .filter(([, d]) => d.errores || d.reintentos || d.tiempoMedioMs > 1500)
    .sort((a, b) => b[1].errores + b[1].reintentos - (a[1].errores + a[1].reintentos));
  if (!dominios.length) return;
  console.log('\nRed (webs con esperas o fallos):');
  for (const [dominio, d] of dominios.slice(0, 8)) {
    console.log(`  ${dominio.padEnd(34)} ${d.peticiones} peticiones · ${d.errores} fallos · ${d.reintentos} reintentos · ${d.tiempoMedioMs} ms de media`);
  }
}

function imprimirInforme({ fuentes, total, podadas, emails, puentes, red }) {
  const iconos = { ok: '✅', error: '❌', desactivada: '⏸️ ', bloqueada: '🚫', pendiente: '⏳' };
  console.log('\nFuente              Estado  Nuevas  Total  Detalle');
  for (const f of fuentes) {
    const detalle = f.error ?? f.motivo ?? (f.ultimoOk ? `ok ${f.ultimoOk.slice(11, 16)} UTC` : '');
    console.log(`${f.nombre.padEnd(20)}${(iconos[f.estado] ?? f.estado).padEnd(8)}${String(f.nuevas).padStart(6)}${String(f.total).padStart(7)}  ${detalle}`);
  }
  console.log(`\n${total} ofertas en total (${podadas} retiradas por caducadas o antiguas).`);
  console.log(`Puentes a la vista: ${puentes.map((p) => `${p.etiqueta} (${p.nombre})`).join('; ') || 'ninguno'}.`);
  if (emails.enviados.length) console.log(`Emails enviados: ${emails.enviados.join(', ')}.`);
  if (emails.errores.length) console.log(`Emails con error: ${emails.errores.join('; ')}.`);
  imprimirRed(red);
}

/**
 * 1 si todas las fuentes que se han ejecutado en ESTA pasada han fallado; si no, 0. Las
 * demás conservan el estado de antes, y una en «ok» de hace horas escondería que ahora
 * ha fallado todo (p. ej. sin red).
 */
export function codigoSalida(informe, generado) {
  const ejecutadas = informe.fuentes.filter((f) => f.ultimoIntento === generado && ['ok', 'error'].includes(f.estado));
  return ejecutadas.length && ejecutadas.every((f) => f.estado === 'error') ? 1 : 0;
}

async function principal() {
  const ruta = (clave) => path.join(RAIZ, RUTAS[clave]);
  const opciones = leerOpciones(process.argv.slice(2), FUENTES.map((f) => f.id));
  // Se valida al arrancar: sin «retencionDias», por ejemplo, la poda no quitaría nada.
  const ajustes = cargarAjustes(ruta('ajustes'));
  const resultado = await escanear({
    ajustes,
    vigilados: cargarVigilados(ruta('vigilados')),
    // cargarEstado migra, valida y, si hace falta, recupera la copia anterior.
    estado: cargarEstado(ruta('estado')),
    cache: new Cache(leerDatos(ruta('cache'), {})),
    historial: leerDatos(ruta('historial'), {}),
    opciones,
  });
  guardarJson(ruta('estado'), resultado.estado);
  guardarJson(ruta('cache'), resultado.cache.exportar());
  guardarJson(ruta('historial'), resultado.historial);
  guardarJson(ruta('panelOfertas'), resultado.salida.ofertas);
  guardarJson(ruta('panelHistorial'), resultado.salida.historial);
  guardarJson(ruta('panelVigilados'), resultado.salida.vigilados);
  imprimirInforme(resultado.informe);

  if (codigoSalida(resultado.informe, resultado.salida.ofertas.generado)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
