import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { configuracionEnvio, crearTransporte, enviarEmail } from '../src/emails/enviar.js';

const GMAIL = { GMAIL_USER: 'buzon@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', EMAIL_TO: 'yo@ejemplo.es' };
const SMTP = { SMTP_HOST: 'smtp.brevo.com', SMTP_USER: 'yo@otro.es', SMTP_PASS: 'secreto-smtp', EMAIL_TO: 'yo@ejemplo.es' };

describe('emails: qué cuenta envía', () => {
  it('sin nada configurado no envía ni avisa', () => {
    const avisos = [];
    assert.deepEqual(configuracionEnvio({}), { estado: 'sin-configurar' });
    // Así llegan al workflow los secretos que no existen: como cadenas vacías.
    assert.deepEqual(configuracionEnvio({ SMTP_HOST: '', SMTP_PASS: '', GMAIL_USER: '', EMAIL_TO: '' }), { estado: 'sin-configurar' });
    assert.equal(crearTransporte({}, (m) => avisos.push(m)), null);
    assert.deepEqual(avisos, []);
  });

  it('con el Gmail completo usa Gmail', () => {
    const config = configuracionEnvio(GMAIL);
    assert.equal(config.estado, 'lista');
    assert.equal(config.remitente, 'buzon@gmail.com');
    assert.deepEqual(config.opciones, { service: 'gmail', auth: { user: 'buzon@gmail.com', pass: 'abcd efgh ijkl mnop' } });
  });

  it('con SMTP completo exige STARTTLS en el 587 y usa TLS directo en el 465', () => {
    const normal = configuracionEnvio(SMTP);
    assert.deepEqual(normal.opciones, { host: 'smtp.brevo.com', port: 587, secure: false, requireTLS: true, auth: { user: 'yo@otro.es', pass: 'secreto-smtp' } });
    const tls = configuracionEnvio({ ...SMTP, SMTP_PORT: '465' });
    assert.equal(tls.opciones.secure, true);
    assert.equal(tls.opciones.requireTLS, false);
  });

  it('nunca manda la contraseña del Gmail a otro servidor', () => {
    // Antes: SMTP_HOST + SMTP_USER + GMAIL_APP_PASSWORD → contraseña del Gmail a smtp.brevo.com.
    const { SMTP_PASS, ...sinClave } = SMTP;
    const config = configuracionEnvio({ ...GMAIL, ...sinClave });
    assert.equal(config.estado, 'incompleta');
    assert.match(config.motivo, /SMTP.*falta SMTP_PASS/);
    assert.equal(config.opciones, undefined);
  });

  it('nunca manda la contraseña de otra cuenta a Gmail', () => {
    // Antes: SMTP_USER + SMTP_PASS sin SMTP_HOST → contraseña de Outlook a smtp.gmail.com.
    const config = configuracionEnvio({ SMTP_USER: 'yo@outlook.es', SMTP_PASS: 'pw', EMAIL_TO: 'x@y.es' });
    assert.equal(config.estado, 'incompleta');
    assert.match(config.motivo, /falta SMTP_HOST/);
  });

  it('avisa (sin parar el escaneo) si la cuenta está a medias', () => {
    const avisos = [];
    assert.equal(crearTransporte({ GMAIL_USER: 'buzon@gmail.com', GMAIL_APP_PASSWORD: 'x' }, (m) => avisos.push(m)), null);
    assert.deepEqual(avisos, ['Emails desactivados: la cuenta Gmail está a medias, falta EMAIL_TO']);
    assert.match(configuracionEnvio({ ...SMTP, SMTP_PORT: 'abc' }).motivo, /SMTP_PORT no es un puerto válido/);
  });

  it('crea el transporte con esas opciones', () => {
    const transporte = crearTransporte(SMTP, () => assert.fail('no debe avisar'));
    assert.equal(transporte.options.host, 'smtp.brevo.com');
    assert.equal(transporte.options.requireTLS, true);
  });
});

describe('emails: envío', () => {
  it('envía desde la cuenta elegida a EMAIL_TO', async () => {
    const enviados = [];
    await enviarEmail({ sendMail: async (m) => enviados.push(m) }, { asunto: 'Hola', html: '<p>h</p>', texto: 'h' }, SMTP);
    assert.deepEqual(enviados, [{ from: 'Escapadas Finde <yo@otro.es>', to: 'yo@ejemplo.es', subject: 'Hola', html: '<p>h</p>', text: 'h' }]);
  });

  it('no envía con una cuenta a medias', async () => {
    await assert.rejects(enviarEmail({ sendMail: async () => assert.fail('no debe enviar') }, { asunto: 'x' }, { SMTP_USER: 'a' }), /cuenta de envío completa/);
  });
});
