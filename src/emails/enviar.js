/**
 * Envío de emails con nodemailer (Gmail por defecto). Las credenciales llegan por
 * variables de entorno (secretos del repo) y nunca se registran.
 */
import nodemailer from 'nodemailer';

/** Transporte listo para enviar, o null si faltan SMTP_USER, SMTP_PASS o EMAIL_TO. */
export function crearTransporte(env) {
  const { SMTP_USER, SMTP_PASS, EMAIL_TO, SMTP_HOST, SMTP_PORT } = env;
  if (!SMTP_USER || !SMTP_PASS || !EMAIL_TO) return null;
  const auth = { user: SMTP_USER, pass: SMTP_PASS };
  return SMTP_HOST
    ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT ?? 587), secure: Number(SMTP_PORT) === 465, auth })
    : nodemailer.createTransport({ service: 'gmail', auth });
}

/** Envía `{asunto, html, texto}` a EMAIL_TO. */
export async function enviarEmail(transporte, { asunto, html, texto }, env) {
  await transporte.sendMail({
    from: `Escapadas Finde <${env.SMTP_USER}>`,
    to: env.EMAIL_TO,
    subject: asunto,
    html,
    text: texto,
  });
}
