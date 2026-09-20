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
import { cargarJson, estadoInicial, guardarJson } from './almacen.js';
import { cargarVigilados } from './vigilados.js';
import { MODULOS, escanear, urlPanel } from './core/scan-pipeline.js';

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

function leerOpciones(argumentos) {
  return {
    forzar: argumentos.includes('--forzar'),
    sinEmails: argumentos.includes('--sin-emails'),
    solo: argumentos.find((a) => a.startsWith('--solo='))?.slice('--solo='.length) ?? null,
  };
}

// Los datos corruptos no deben parar el vigilante: se avisa y se empieza de cero.
function leerDatos(ruta, porDefecto) {
  try {
    return cargarJson(ruta, porDefecto);
  } catch (error) {
    console.warn(`⚠️  ${path.relative(RAIZ, ruta)} no se puede leer (${error.message}); se empieza de cero`);
    return structuredClone(porDefecto);
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

async function principal() {
  const ruta = (clave) => path.join(RAIZ, RUTAS[clave]);
  const opciones = leerOpciones(process.argv.slice(2));
  const ajustes = cargarJson(ruta('ajustes'));
  const resultado = await escanear({
    ajustes,
    vigilados: cargarVigilados(ruta('vigilados')),
    estado: leerDatos(ruta('estado'), estadoInicial()),
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

  const ejecutadas = resultado.informe.fuentes.filter((f) => ['ok', 'error'].includes(f.estado));
  if (ejecutadas.length && ejecutadas.every((f) => f.estado === 'error')) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
