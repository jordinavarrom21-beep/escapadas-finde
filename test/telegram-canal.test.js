import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mensajeTelegram, publicarEnTelegram } from '../src/emails/telegram.js';
import { AJUSTES, oferta } from './ayudas.js';

const ENV = { TELEGRAM_BOT_TOKEN: '123:secreto', TELEGRAM_CANAL: '@escapadasfinde' };
// Un chollazo seguro: error de tarifa (motivoChollazo).
// Como los marca puntuar: `chollazo: true` (el canal publica los mismos que la web).
const chollazo = (id) => ({ ...oferta({ id: `prueba:${id}`, titulo: `Hotel ${id} & spa`, precio: 50, unidad: 'total' }), chollazo: true });
const red = (estadoHttp = 200) => {
  const enviados = [];
  return { enviados, fetch: async (url, opciones) => { enviados.push({ url, cuerpo: JSON.parse(opciones.body) }); return { ok: estadoHttp < 400, status: estadoHttp }; } };
};

describe('canal de Telegram (opcional)', () => {
  it('sin los dos secretos no hace nada ni toca el estado', async () => {
    const estado = {};
    const { fetch, enviados } = red();
    assert.deepEqual(await publicarEnTelegram({ ofertas: [chollazo('a')], estado, ajustes: AJUSTES, env: {}, fetch }), { publicados: 0 });
    assert.equal(enviados.length, 0);
    assert.equal(estado.telegram, undefined);
  });

  it('la primera vez solo toma nota; después publica los nuevos, como mucho 3 por escaneo', async () => {
    const estado = {};
    const { fetch, enviados } = red();
    const base = { estado, ajustes: AJUSTES, env: ENV, fetch, panelUrl: 'https://escapadasfinde.com' };
    await publicarEnTelegram({ ...base, ofertas: [chollazo('viejo')] });
    assert.equal(enviados.length, 0, 'los que ya había no se publican');
    const nuevos = ['n1', 'n2', 'n3', 'n4'].map(chollazo);
    assert.deepEqual(await publicarEnTelegram({ ...base, ofertas: [chollazo('viejo'), ...nuevos] }), { publicados: 3 });
    assert.equal(enviados[0].cuerpo.chat_id, '@escapadasfinde');
    assert.match(enviados[0].url, /^https:\/\/api\.telegram\.org\/bot123:secreto\/sendMessage$/);
    assert.deepEqual(await publicarEnTelegram({ ...base, ofertas: [chollazo('viejo'), ...nuevos] }), { publicados: 1 }, 'el cuarto, en el siguiente');
  });

  it('si Telegram falla, para, lo dice sin el token y lo reintenta la próxima vez', async () => {
    const estado = { telegram: { inicializado: true, publicados: {} } };
    const logs = [];
    const { fetch } = red(403);
    assert.deepEqual(await publicarEnTelegram({ ofertas: [chollazo('x')], estado, ajustes: AJUSTES, env: ENV, fetch, log: (m) => logs.push(m) }), { publicados: 0 });
    assert.match(logs[0], /Telegram ha respondido 403/);
    assert.doesNotMatch(logs.join(' '), /secreto/);
    assert.equal(estado.telegram.publicados['prueba:x'], undefined);
  });

  it('el mensaje escapa el texto y enlaza a la ficha de la oferta', () => {
    const m = mensajeTelegram({ ...chollazo('t1'), titulo: 'Hotel <b> & spa', lugar: { nombre: 'Tossa de Mar' }, chollazoMotivo: 'La web lo publica como error de tarifa' }, 'https://escapadasfinde.com');
    assert.match(m, /<b>Hotel &lt;b&gt; &amp; spa<\/b>/);
    assert.match(m, /📍 Tossa de Mar/);
    assert.match(m, /href="https:\/\/escapadasfinde\.com\/#\/oferta\/prueba%3At1"/);
  });
});

describe('canal de Telegram: robustez', () => {
  it('un registro guardado con otra forma no rompe nada y se rehace', async () => {
    const { fetch } = red();
    for (const telegram of [true, { inicializado: true }, { inicializado: true, publicados: [] }]) {
      const estado = { telegram };
      await publicarEnTelegram({ ofertas: [chollazo('r')], estado, ajustes: AJUSTES, env: ENV, fetch });
      assert.equal(typeof estado.telegram.publicados, 'object');
    }
  });
  it('un mensaje rechazado (400) se salta y no bloquea a los siguientes', async () => {
    const estado = { telegram: { inicializado: true, publicados: {} } };
    let n = 0;
    const fetch = async () => ({ ok: n++ > 0, status: n === 1 ? 400 : 200 });
    const r = await publicarEnTelegram({ ofertas: [chollazo('malo'), chollazo('bueno')], estado, ajustes: AJUSTES, env: ENV, fetch, log: () => {} });
    assert.deepEqual(r, { publicados: 1 });
    assert.ok(estado.telegram.publicados['prueba:malo'] && estado.telegram.publicados['prueba:bueno']);
  });
});
