/**
 * Envío de emails con nodemailer (Gmail por defecto). Las credenciales llegan por
 * variables de entorno (secretos del repo) y nunca se registran.
 *
 * Remitente: SMTP_USER/SMTP_PASS o, si no están, el Gmail dedicado del buzón
 * (GMAIL_USER/GMAIL_APP_PASSWORD). Destinatario: EMAIL_TO.
 */
import nodemailer from 'nodemailer';

function credenciales(env) {
  return {
    user: env.SMTP_USER || env.GMAIL_USER,
    pass: env.SMTP_PASS || env.GMAIL_APP_PASSWORD,
  };
}

/** Transporte listo para enviar, o null si faltan credenciales o EMAIL_TO. */
export function crearTransporte(env) {
  const auth = credenciales(env);
  if (!auth.user || !auth.pass || !env.EMAIL_TO) return null;
  const { SMTP_HOST, SMTP_PORT } = env;
  return SMTP_HOST
    ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT ?? 587), secure: Number(SMTP_PORT) === 465, auth })
    : nodemailer.createTransport({ service: 'gmail', auth });
}

/** Envía `{asunto, html, texto}` a EMAIL_TO. */
export async function enviarEmail(transporte, { asunto, html, texto }, env) {
  await transporte.sendMail({
    from: `Escapadas Finde <${credenciales(env).user}>`,
    to: env.EMAIL_TO,
    subject: asunto,
    html,
    text: texto,
  });
}
