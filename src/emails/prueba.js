#!/usr/bin/env node
/**
 * npm run email:prueba — con SMTP configurado envía un email de prueba (el
 * resumen con los datos actuales) a EMAIL_TO; sin SMTP guarda los cuatro tipos de
 * email como HTML en data/emails-prueba/ para verlos en el navegador.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearTransporte, enviarEmail } from './enviar.js';
import { alertaChollazos, alertaFuentes, alertaVigilados, resumenSemanal } from './plantillas.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = (ruta) => JSON.parse(readFileSync(path.join(RAIZ, ruta), 'utf8'));

const rutaDatos = ['site/data/ofertas.json', 'test/fixtures/panel/ofertas.json'].find((r) => existsSync(path.join(RAIZ, r)));
if (!rutaDatos) throw new Error('No hay datos: ejecuta antes «npm run escanear»');
const datos = leer(rutaDatos);
const ajustes = leer('config/ajustes.json');
const ahora = new Date();
const panelUrl = ajustes.panelUrl ?? (process.env.GITHUB_REPOSITORY
  ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : 'http://localhost:8080/');
const { ofertas, findes, puentes } = datos;
const resumen = resumenSemanal({ ofertas, findes, puentes, ajustes, panelUrl, ahora });

const transporte = crearTransporte(process.env);
if (transporte) {
  await enviarEmail(transporte, { ...resumen, asunto: `[Prueba] ${resumen.asunto}` }, process.env);
  console.log('Email de prueba enviado a EMAIL_TO.');
} else {
  const destino = path.join(RAIZ, 'data/emails-prueba');
  mkdirSync(destino, { recursive: true });
  const mejores = [...ofertas].sort((a, b) => b.puntuacion - a.puntuacion);
  const muestras = {
    resumen,
    chollazos: alertaChollazos({ ofertas: mejores.slice(0, 3), panelUrl }),
    vigilados: alertaVigilados({ coincidencias: mejores.slice(0, 2).map((oferta) => ({ criterio: { nombre: 'Ejemplo de vigilado' }, oferta })), panelUrl }),
    fuentes: alertaFuentes({ fuentes: [{ nombre: 'Fuente de ejemplo', error: 'HTTP 503 en ejemplo.es', desdeError: new Date(ahora - 30 * 3_600_000).toISOString() }], panelUrl, ahora }),
  };
  for (const [nombre, { asunto, html }] of Object.entries(muestras)) {
    writeFileSync(path.join(destino, `${nombre}.html`), html);
    console.log(`${nombre}.html — «${asunto}»`);
  }
  console.log(`Sin SMTP configurado: emails guardados en ${destino} (datos de ${rutaDatos}).`);
}
