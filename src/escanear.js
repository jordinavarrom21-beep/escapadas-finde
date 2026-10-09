#!/usr/bin/env node
/**
 * CLI del escaneo: lee la configuración y los datos, llama al núcleo
 * (src/core/scan-pipeline.js), guarda los archivos e imprime el resumen.
 *
 * Uso: node src/escanear.js [--forzar] [--solo=<fuente>] [--sin-emails] [--diagnostico]
 */
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { CARPETAS, generarPaginas } from './paginas.js';
import { fileURLToPath } from 'node:url';
import { Cache } from './cache.js';
import { cargarEstado, cargarJson, guardarJson } from './almacen.js';
import { cargarAjustes } from './ajustes.js';
import { cargarVigilados } from './vigilados.js';
import { cargarAfiliacion } from './afiliacion.js';
import { cargarPeajes } from './peajes.js';
import { MODULOS, escanear, urlPanel } from './core/scan-pipeline.js';
import { FUENTES } from './fuentes/index.js';
import { separarDatosPanel } from './panel-datos.js';
import { diagnostico } from './diagnostico.js';

// Se reexportan para quien importaba el núcleo desde aquí.
export { MODULOS, escanear, urlPanel };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTAS = {
  ajustes: 'config/ajustes.json',
  vigilados: 'config/vigilados.json',
  afiliacion: 'config/afiliacion.json',
  peajes: 'config/peajes.json',
  estado: 'data/estado.json',
  cache: 'data/cache.json',
  historial: 'data/historial.json',
  panelOfertas: 'site/data/ofertas.json',
  panelHistorial: 'site/data/historial.json',
  panelDetalles: 'site/data/detalles.json',
  panelVersion: 'site/data/version.json',
  panelVigilados: 'site/data/vigilados.json',
};

const USO = 'Uso: node src/escanear.js [--forzar] [--solo=<fuente>] [--sin-emails] [--diagnostico]';

/**
 * Opciones de la línea de órdenes. Un argumento que no se entiende detiene el escaneo: si
 * no, «--solo ryanair» (sin «=») se ignoraría y se consultarían todas las fuentes.
 * @param {string[]} argumentos
 * @param {string[]} [ids] fuentes que existen, para comprobar la de «--solo»
 */
export function leerOpciones(argumentos, ids = null) {
  const desconocidos = argumentos.filter((a) => !['--forzar', '--sin-emails', '--diagnostico'].includes(a) && !/^--solo=[a-z0-9-]+$/.test(a));
  if (desconocidos.length) throw new Error(`Argumento no válido: ${desconocidos.join(' ')}. ${USO}`);
  const solo = argumentos.find((a) => a.startsWith('--solo='))?.slice('--solo='.length) ?? null;
  if (solo && ids && !ids.includes(solo)) throw new Error(`No hay ninguna fuente «${solo}». Las fuentes son: ${ids.join(', ')}`);
  return { forzar: argumentos.includes('--forzar'), sinEmails: argumentos.includes('--sin-emails'), diagnostico: argumentos.includes('--diagnostico'), solo };
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

/**
 * Páginas con URL legible para buscadores (src/paginas.js) y el sitemap. Las de la pasada
 * anterior se borran: una guía que ya no tiene ofertas suficientes no debe quedarse publicada.
 */
/**
 * Muestras para arreglar lectores: en data/muestras/<fuente>/ las páginas que leyó en esta
 * ejecución una fuente que ha fallado o que avisa de que su web ha cambiado, con un LEEME.txt
 * que dice por qué y de qué URL es cada una. Se guardan en la rama «datos» con el resto, así
 * se puede ajustar el lector con la página real. Las de una fuente que vuelve a ir bien se borran.
 * @param {{guardar: Array<{fuente: string, cuando: string, motivo: string, paginas: {url: string, cuerpo: string}[]}>, sanas: string[]}} muestras
 * @param {string} carpeta
 */
export function escribirMuestras(muestras, carpeta) {
  if (!muestras) return;
  for (const id of muestras.sanas) rmSync(path.join(carpeta, id), { recursive: true, force: true });
  for (const { fuente, cuando, motivo, paginas } of muestras.guardar) {
    const destino = path.join(carpeta, fuente);
    rmSync(destino, { recursive: true, force: true });
    mkdirSync(destino, { recursive: true });
    const nombres = paginas.map(({ cuerpo }, i) => `pagina-${i + 1}.${/^\s*[[{]/.test(cuerpo) ? 'json' : 'html'}`);
    paginas.forEach(({ cuerpo }, i) => writeFileSync(path.join(destino, nombres[i]), cuerpo));
    const indice = paginas.map(({ url }, i) => `${nombres[i]}: ${url}`).join('\n');
    writeFileSync(path.join(destino, 'LEEME.txt'), `Fuente: ${fuente}\nCuándo: ${cuando}\nMotivo: ${motivo}\n\n${indice}\n`);
  }
}

function escribirPaginas(datos, base) {
  const sitio = path.join(RAIZ, 'site');
  for (const carpeta of CARPETAS) rmSync(path.join(sitio, carpeta), { recursive: true, force: true });
  rmSync(path.join(sitio, 'sitemap.xml'), { force: true });
  rmSync(path.join(sitio, 'robots.txt'), { force: true });
  const { archivos } = generarPaginas(datos, { base });
  for (const { ruta, contenido } of archivos) {
    const destino = path.join(sitio, ruta);
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  }
  console.log(`\n${archivos.length} páginas para buscadores escritas en site/ (${base ? 'con sitemap' : 'sin sitemap: falta la URL pública del panel'}).`);
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
  const vigilados = cargarVigilados(ruta('vigilados'));
  const afiliacion = cargarAfiliacion(ruta('afiliacion'));
  // Qué está configurado y qué falta, al principio del registro de cada escaneo (sin valores
  // de secretos). Con --diagnostico, solo eso: no se escanea nada.
  const { lineas, avisos } = diagnostico({ ajustes, vigilados, afiliacion, fuentes: FUENTES, env: process.env });
  if (opciones.diagnostico) {
    console.log(`Diagnóstico de la configuración\n  ${lineas.join('\n  ')}${avisos.length ? `\n\nPara arreglar:\n  - ${avisos.join('\n  - ')}` : '\n\nTodo lo necesario está configurado.'}`);
    return;
  }
  // El del email a medias ya lo da el envío de emails: aquí, el resto.
  for (const aviso of avisos.filter((a) => !a.startsWith('Emails'))) console.warn(`⚠️  ${aviso}`);
  const resultado = await escanear({
    ajustes,
    vigilados,
    afiliacion,
    peajes: cargarPeajes(ruta('peajes')),
    // cargarEstado migra, valida y, si hace falta, recupera la copia anterior.
    estado: cargarEstado(ruta('estado')),
    cache: new Cache(leerDatos(ruta('cache'), {})),
    historial: leerDatos(ruta('historial'), {}),
    opciones,
  });
  guardarJson(ruta('estado'), resultado.estado);
  guardarJson(ruta('cache'), resultado.cache.exportar());
  guardarJson(ruta('historial'), resultado.historial);
  // El panel carga primero lo ligero; lo de la ficha, al abrir la primera (panel-datos.js).
  const panel = separarDatosPanel(resultado.salida.ofertas);
  guardarJson(ruta('panelOfertas'), panel.ofertas);
  guardarJson(ruta('panelDetalles'), panel.detalles);
  guardarJson(ruta('panelVersion'), panel.version);
  guardarJson(ruta('panelHistorial'), resultado.salida.historial);
  guardarJson(ruta('panelVigilados'), resultado.salida.vigilados);
  escribirPaginas(resultado.salida.ofertas, urlPanel(ajustes, process.env));
  escribirMuestras(resultado.muestras, path.join(RAIZ, 'data', 'muestras'));
  imprimirInforme(resultado.informe);

  if (codigoSalida(resultado.informe, resultado.salida.ofertas.generado)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
