/**
 * Envío de emails con nodemailer. Las credenciales llegan por variables de entorno
 * (secretos del repo) y nunca se registran.
 *
 * Remitente, uno de estos dos juegos COMPLETOS (nunca se mezclan campos de uno y otro,
 * para no mandar la contraseña de una cuenta al servidor de la otra):
 *   - SMTP_HOST + SMTP_USER + SMTP_PASS (+ SMTP_PORT, 587 por defecto, y SMTP_FROM si el
 *     usuario no es una dirección, como en SendGrid o SES): cualquier servidor.
 *   - GMAIL_USER + GMAIL_APP_PASSWORD: el Gmail dedicado del buzón.
 * Si hay algo de SMTP_*, manda SMTP. Destinatario: EMAIL_TO.
 */
import nodemailer from 'nodemailer';

const PUERTO_SMTP = 587;
const PUERTO_TLS_DIRECTO = 465;

/**
 * Qué cuenta se usaría para enviar, sin crear nada.
 * @returns {{estado: 'sin-configurar'} | {estado: 'incompleta', motivo: string} |
 *   {estado: 'lista', remitente: string, opciones: object}}
 */
export function configuracionEnvio(env) {
  const faltan = (nombres) => nombres.filter((nombre) => !env[nombre]);
  const smtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const gmail = ['GMAIL_USER', 'GMAIL_APP_PASSWORD'];
  const usaSmtp = [...smtp, 'SMTP_PORT'].some((nombre) => env[nombre]);
  const cuenta = usaSmtp ? smtp : gmail;
  const hayAlgo = usaSmtp || gmail.some((nombre) => env[nombre]) || env.EMAIL_TO;
  if (!hayAlgo) return { estado: 'sin-configurar' };

  const falta = [...faltan(cuenta), ...faltan(['EMAIL_TO'])];
  if (falta.length) {
    const tipo = usaSmtp ? 'SMTP' : 'Gmail';
    return { estado: 'incompleta', motivo: `Emails desactivados: la cuenta ${tipo} está a medias, falta ${falta.join(', ')}` };
  }
  if (!usaSmtp) {
    return {
      estado: 'lista',
      remitente: env.GMAIL_USER,
      opciones: { service: 'gmail', auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } },
    };
  }
  const puerto = env.SMTP_PORT ? Number(env.SMTP_PORT) : PUERTO_SMTP;
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    return { estado: 'incompleta', motivo: `Emails desactivados: SMTP_PORT no es un puerto válido («${env.SMTP_PORT}»)` };
  }
  const tlsDirecto = puerto === PUERTO_TLS_DIRECTO;
  return {
    estado: 'lista',
    remitente: env.SMTP_FROM || env.SMTP_USER,
    // Sin TLS directo se exige STARTTLS: nunca se manda la contraseña en claro.
    opciones: { host: env.SMTP_HOST, port: puerto, secure: tlsDirecto, requireTLS: !tlsDirecto, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } },
  };
}

/**
 * Transporte listo para enviar, o null si no hay cuenta configurada. Si está a
 * medias, lo dice por `log` (una cuenta mal puesta no debe parar el escaneo).
 */
export function crearTransporte(env, log = console.warn) {
  const config = configuracionEnvio(env);
  if (config.estado === 'incompleta') log(config.motivo);
  return config.estado === 'lista' ? nodemailer.createTransport(config.opciones) : null;
}

/** Envía `{asunto, html, texto}` a EMAIL_TO desde la cuenta configurada. */
export async function enviarEmail(transporte, { asunto, html, texto }, env) {
  const config = configuracionEnvio(env);
  if (config.estado !== 'lista') throw new Error('No hay una cuenta de envío completa');
  await transporte.sendMail({
    from: `Escapadas Finde <${config.remitente}>`,
    to: env.EMAIL_TO,
    subject: asunto,
    html,
    text: texto,
  });
}
