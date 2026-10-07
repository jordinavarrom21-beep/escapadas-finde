/**
 * «npm run diagnostico»: qué está configurado y qué falta, sin escanear nada ni pedir nada
 * a ninguna web. De los secretos solo dice si están puestos: nunca su valor.
 */
import { configuracionEnvio } from './emails/enviar.js';
import { proveedoresActivos } from './afiliacion.js';

/** Secretos opcionales y para qué sirve cada uno (los de email los explica configuracionEnvio). */
const OPCIONALES = [
  ['TICKETMASTER_KEY', 'conciertos, festivales y deporte de toda España'],
  ['AWIN_API_TOKEN', 'activar solos los programas de Awin en los que te acepten'],
  ['ANTHROPIC_API_KEY', 'resúmenes de una frase, de pago'],
];

/**
 * Las líneas del diagnóstico. `avisos` son las que conviene arreglar (no paran el escaneo:
 * un vigilante automático no debe dejar de publicar porque falte el email).
 */
export function diagnostico({ ajustes, vigilados = [], afiliacion = {}, fuentes = [], env = {} }) {
  const lineas = [];
  const avisos = [];
  const puesto = (nombre) => Boolean(env[nombre]?.trim?.());

  lineas.push(`Salida: ${ajustes.origen.nombre} (${ajustes.origen.lat}, ${ajustes.origen.lon}) · ${ajustes.viajeros} viajeros`);
  lineas.push(`Web: ${env.PANEL_URL || ajustes.panelUrl || '(sin dirección: el sitemap y los emails no tendrán enlaces)'}`);
  if (!env.PANEL_URL && !ajustes.panelUrl) avisos.push('Falta panelUrl en config/ajustes.json');

  const desactivadas = fuentes.filter((f) => ajustes.fuentes?.[f.id]?.activa === false);
  const sinSecreto = fuentes.filter((f) => ajustes.fuentes?.[f.id]?.activa !== false && (f.requiere ?? []).some((v) => !puesto(v)));
  lineas.push(`Webs: ${fuentes.length - desactivadas.length - sinSecreto.length} activas de ${fuentes.length}`
    + `${desactivadas.length ? ` · desactivadas: ${desactivadas.map((f) => f.nombre).join(', ')}` : ''}`
    + `${sinSecreto.length ? ` · esperando su secreto: ${sinSecreto.map((f) => `${f.nombre} (${f.requiere.filter((v) => !puesto(v)).join(', ')})`).join(', ')}` : ''}`);

  const envio = configuracionEnvio(env);
  if (envio.estado === 'lista') lineas.push(`Emails: listos (${envio.opciones.service === 'gmail' ? 'Gmail' : 'SMTP'})`);
  else if (envio.estado === 'incompleta') { lineas.push(envio.motivo); avisos.push(envio.motivo); }
  else lineas.push('Emails: sin configurar (opcional: GMAIL_USER, GMAIL_APP_PASSWORD y EMAIL_TO)');
  lineas.push(`Avisos por email (config/vigilados.json): ${vigilados.length}`);

  for (const [nombre, para] of OPCIONALES) lineas.push(`${nombre}: ${puesto(nombre) ? 'puesto' : 'no puesto'} (${para})`);

  const activos = proveedoresActivos(afiliacion);
  lineas.push(`Afiliación activa: ${activos.length ? activos.map((p) => p.id).join(', ') : 'ninguna'}`
    + `${afiliacion.redes?.awin?.afiliado ? ` · Awin ${afiliacion.redes.awin.afiliado}` : ''}`);
  return { lineas, avisos };
}
