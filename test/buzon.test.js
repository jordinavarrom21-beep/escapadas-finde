import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, {
  ErrorBloqueo, comercioDe, enlacesPorResolver, leerBuzon, limpiarTexto, nombresPrivados,
  parsearEmail, resolverEnlace, urlDirecta,
} from '../src/fuentes/buzon.js';
import { Cache } from '../src/cache.js';
import { validarOferta } from '../src/modelo.js';
import { AHORA, crearCtx, leerFixture } from './ayudas.js';

const DESTINATARIO = 'ofertas.finde.demo@gmail.com';

const EMAILS = {
  booking: {
    de: 'Booking.com <email.campaign@sg.booking.com>',
    para: DESTINATARIO,
    asunto: 'Jordi, Ofertas de Fin de Semana: ahorra un 15 % o más',
    fecha: new Date('2026-09-17T07:30:00Z'),
    html: leerFixture('buzon-booking.html'),
    messageId: '<nl-wknd-20260917.304142@sg.booking.com>',
  },
  vueling: {
    de: 'Vueling <vueling@news.vueling.com>',
    para: `Jordi <${DESTINATARIO}>`,
    asunto: 'Jordi, vuela a Roma desde 29,99 €',
    fecha: new Date('2026-09-17T16:05:00Z'),
    html: leerFixture('buzon-vueling.html'),
    messageId: '<0f3c9a.otono26@news.vueling.com>',
  },
  groupon: {
    de: 'Groupon <noreply@r.groupon.es>',
    para: DESTINATARIO,
    asunto: 'Escapadas de otoño con hasta -60 %',
    fecha: new Date('2026-09-16T09:00:00Z'),
    html: leerFixture('buzon-groupon.html'),
    messageId: '<escapadas-otono.77aa@r.groupon.es>',
  },
};

const PROHIBIDOS = [
  'Jordi', 'Navarro', DESTINATARIO, 'ofertas.finde.demo', '%40', 'upn=', 'qs=', 'utm_', 'token', 'hotel_id',
  '/els/v2/', 'click.e.vueling', 'email.booking.com', 'links.groupon', 'sendgrid', 'de baja', 'Oosterdokskade',
  'El Prat de Llobregat', 'Castellana', 'derechos reservados', 'tasa turística',
];

function sinDatosPersonales(ofertas) {
  const json = JSON.stringify(ofertas);
  for (const prohibido of PROHIBIDOS) assert.ok(!json.includes(prohibido), `se filtra «${prohibido}»`);
  for (const o of ofertas) {
    assert.ok(!/[?#]/.test(o.url), o.url);
    assert.ok(o.imagen === null || !/[?#]/.test(o.imagen), o.imagen);
  }
}

const porTitulo = (ofertas, inicio) => ofertas.find((o) => o.titulo.startsWith(inicio));

describe('buzon: parsearEmail con las newsletters de ejemplo', () => {
  const booking = parsearEmail(EMAILS.booking);
  const vueling = parsearEmail(EMAILS.vueling);
  const groupon = parsearEmail(EMAILS.groupon);

  it('crea ofertas válidas con id estable, etiquetas y fechas del email', () => {
    for (const [ofertas, cuantas, comercio] of [[booking, 3, 'Booking.com'], [vueling, 4, 'Vueling'], [groupon, 3, 'Groupon']]) {
      assert.equal(ofertas.length, cuantas, comercio);
      for (const o of ofertas) {
        assert.deepEqual(validarOferta(o), [], o.id);
        assert.match(o.id, /^buzon:[\da-f]{12}-\d+$/);
        assert.deepEqual(o.etiquetas, ['newsletter', comercio]);
      }
      assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    }
    assert.deepEqual(parsearEmail(EMAILS.booking).map((o) => o.id), booking.map((o) => o.id));
    assert.equal(booking[0].publicada, '2026-09-17T07:30:00.000Z');
    assert.equal(booking[0].caduca, '2026-09-24T07:30:00.000Z');
  });

  it('Booking: hoteles con precio por noche, precio tachado e imagen sin query', () => {
    const peralada = porTitulo(booking, 'Hotel Peralada');
    assert.equal(peralada.titulo, 'Hotel Peralada Wine Spa & Golf');
    assert.equal(peralada.tipo, 'hotel');
    assert.equal(peralada.precio, 142);
    assert.equal(peralada.precioTexto, '142 € por noche');
    assert.equal(peralada.unidad, 'noche');
    assert.equal(peralada.precioAnterior, 189);
    assert.equal(peralada.descuento, 25);
    assert.equal(peralada.noches, 2);
    assert.equal(peralada.imagen, 'https://cf.bstatic.com/xdata/images/hotel/max500/412345678.jpg');
    assert.match(peralada.descripcion, /^Peralada · Girona/);
    const cardona = porTitulo(booking, 'Parador de Cardona');
    assert.equal(cardona.precioTexto, 'Desde 98 € por noche');
    assert.equal(porTitulo(booking, 'Hotel Roc Blanc').precio, 76);
  });

  it('Vueling: vuelos con destino y precio por trayecto (unidad null)', () => {
    const roma = porTitulo(vueling, 'Barcelona → Roma');
    assert.equal(roma.tipo, 'vuelo');
    assert.equal(roma.transporte, 'avion');
    assert.equal(roma.precio, 29.99);
    assert.equal(roma.precioTexto, 'desde 29,99 €');
    assert.equal(roma.unidad, null);
    assert.deepEqual(roma.lugar, { nombre: 'Roma', region: null, pais: null, lat: null, lon: null });
    assert.equal(roma.imagen, 'https://image.e.vueling.com/lib/fe3c15707564067b7d1c78/m/1/roma-coliseo.jpg');
    assert.equal(porTitulo(vueling, 'Barcelona → Ámsterdam').lugar.nombre, 'Ámsterdam');
    assert.equal(porTitulo(vueling, '¡Otoño en Europa!').precio, 24.99);
  });

  it('Groupon: precio total para 2, descuento y destino antes de los dos puntos', () => {
    const lloret = porTitulo(groupon, 'Costa Brava');
    assert.equal(lloret.tipo, 'escapada');
    assert.equal(lloret.precio, 59);
    assert.equal(lloret.precioAnterior, 118);
    assert.equal(lloret.descuento, 50);
    assert.equal(lloret.unidad, 'total');
    assert.equal(lloret.noches, 1);
    assert.equal(lloret.lugar.nombre, 'Costa Brava');
    assert.equal(porTitulo(groupon, 'Andorra').noches, 2);
    assert.equal(porTitulo(groupon, 'Montseny').descuento, 50);
  });

  it('sin resolver, limpia los enlaces directos al comercio y el resto va a la portada', () => {
    assert.ok(booking.every((o) => o.url === 'https://www.booking.com'));
    assert.equal(porTitulo(vueling, 'Barcelona → Lisboa').url, 'https://www.vueling.com/es/vuelos-baratos/barcelona-lisboa');
    assert.equal(porTitulo(vueling, 'Barcelona → Roma').url, 'https://www.vueling.com/es');
    assert.equal(porTitulo(groupon, 'Montseny').url, 'https://www.groupon.es/deals/hotel-rural-montseny-5');
    assert.equal(porTitulo(groupon, 'Costa Brava').url, 'https://www.groupon.es');
  });

  it('usa los enlaces ya resueltos', () => {
    const enlaces = enlacesPorResolver(EMAILS.booking);
    assert.equal(enlaces.length, 3);
    assert.ok(enlaces.every(({ enlace, comercio }) => enlace.startsWith('https://email.booking.com/') && comercio.nombre === 'Booking.com'));
    const resueltos = new Map([[enlaces[0].enlace, 'https://www.booking.com/hotel/es/peralada.es.html'], [enlaces[1].enlace, null]]);
    const ofertas = parsearEmail(EMAILS.booking, { resueltos });
    assert.equal(ofertas[0].url, 'https://www.booking.com/hotel/es/peralada.es.html');
    assert.equal(ofertas[1].url, 'https://www.booking.com');
  });

  it('no filtra datos personales, enlaces con token ni texto del pie', () => {
    sinDatosPersonales([...booking, ...vueling, ...groupon]);
  });
});

describe('buzon: emails sin bloques y remitentes', () => {
  const ryanair = {
    de: 'Ryanair <ryanair@mail.ryanair.com>',
    para: DESTINATARIO,
    asunto: 'Jordi, nuevas rutas de invierno desde 14,99 €',
    fecha: '2026-09-17T10:00:00Z',
    texto: [
      'Hola Jordi,',
      'Este invierno estrenamos rutas desde Barcelona.',
      `Descubre las rutas: https://www.ryanair.com/es/es/cheap-flights?cid=EM-123&email=${encodeURIComponent(DESTINATARIO)}`,
      'Darte de baja: https://www.ryanair.com/es/es/unsubscribe?token=abc123',
    ].join('\n\n'),
    messageId: '<rutas-invierno@mail.ryanair.com>',
  };

  it('crea una sola oferta con el asunto (sin el nombre) y el primer enlace principal', () => {
    const [oferta, ...resto] = parsearEmail(ryanair);
    assert.equal(resto.length, 0);
    assert.deepEqual(validarOferta(oferta), []);
    assert.equal(oferta.titulo, 'Nuevas rutas de invierno desde 14,99 €');
    assert.equal(oferta.url, 'https://www.ryanair.com/es/es/cheap-flights');
    assert.equal(oferta.precio, 14.99);
    assert.equal(oferta.descripcion, '');
    assert.equal(oferta.tipo, 'vuelo');
    sinDatosPersonales([oferta]);
  });

  it('ignora remitentes desconocidos y los avisos de cuenta de Google', () => {
    assert.deepEqual(parsearEmail({ ...ryanair, de: 'Tienda <ofertas@tienda-desconocida.com>' }), []);
    assert.deepEqual(parsearEmail({ ...ryanair, de: 'Google <no-reply@accounts.google.com>' }), []);
  });

  it('identifica el comercio por el dominio del remitente', () => {
    assert.equal(comercioDe('"Booking.com" <email.campaign@sg.booking.com>').nombre, 'Booking.com');
    assert.equal(comercioDe('Iberia Express <news@info.iberiaexpress.com>').nombre, 'Iberia Express');
    assert.equal(comercioDe('Google Flights <noreply-travel@google.com>').nombre, 'Google Flights');
    assert.equal(comercioDe('Falso <ofertas@booking.com.estafa.net>'), null);
  });
});

describe('buzon: limpieza de enlaces', () => {
  const booking = comercioDe('x@booking.com');
  const vueling = comercioDe('x@vueling.com');

  it('urlDirecta solo acepta la web del comercio, sin query ni fragmento', () => {
    assert.equal(urlDirecta('https://www.booking.com/hotel/es/peralada.es.html?aid=1&sid=abc#fotos', booking), 'https://www.booking.com/hotel/es/peralada.es.html');
    assert.equal(urlDirecta('https://email.booking.com/ls/click?upn=abc', booking), null);
    assert.equal(urlDirecta('https://click.e.vueling.com/?qs=abc', vueling), null);
    assert.equal(urlDirecta('https://www.booking.com.estafa.net/hotel', booking), null);
    assert.equal(urlDirecta('https://www.booking.com/r/aGVsbG8xMjM0NTY3ODkwYWJj', booking), null);
    assert.equal(urlDirecta(`https://www.booking.com/u/${encodeURIComponent(DESTINATARIO)}`, booking), null);
  });

  function http(saltos) {
    const pedidas = [];
    return {
      pedidas,
      async redireccion(url, { timeoutMs }) {
        pedidas.push(url);
        assert.ok(timeoutMs > 0 && timeoutMs <= 3000);
        return saltos(url);
      },
    };
  }

  it('sigue las redirecciones del rastreador sin llegar a pedir la web del comercio', async () => {
    const cliente = http((url) => (url.startsWith('https://email.booking.com/')
      ? { estado: 302, destino: 'https://u123.ct.sendgrid.net/ls/click?upn=zzz' }
      : { estado: 301, destino: 'https://www.booking.com/hotel/es/peralada.es.html?aid=304142&label=nl#fotos' }));
    const final = await resolverEnlace('https://email.booking.com/ls/click?upn=u001.abc', booking, cliente);
    assert.equal(final, 'https://www.booking.com/hotel/es/peralada.es.html');
    assert.equal(cliente.pedidas.length, 2);
  });

  it('devuelve null si acaba fuera del comercio o supera 5 saltos', async () => {
    const fuera = http(() => ({ estado: 302, destino: 'https://www.otra-agencia.com/oferta?x=1' }));
    assert.equal(await resolverEnlace('https://email.booking.com/ls/click?upn=1', booking, fuera), null);
    const bucle = http((url) => ({ estado: 302, destino: `${url}1` }));
    assert.equal(await resolverEnlace('https://email.booking.com/ls/click?upn=1', booking, bucle), null);
    assert.equal(bucle.pedidas.length, 5);
    const sinRedireccion = http(() => ({ estado: 200, destino: null }));
    assert.equal(await resolverEnlace('https://email.booking.com/ls/click?upn=1', booking, sinRedireccion), null);
  });

  it('lanza ErrorBloqueo ante un 403 o 429', async () => {
    await assert.rejects(resolverEnlace('https://email.booking.com/x', booking, http(() => ({ estado: 403, destino: null }))), ErrorBloqueo);
    await assert.rejects(resolverEnlace('https://email.booking.com/x', booking, http(() => ({ estado: 429, destino: null }))), /email\.booking\.com responde 429/);
  });
});

describe('buzon: privacidad de los textos', () => {
  it('detecta el nombre en el saludo, en «Para» y al principio del asunto', () => {
    assert.deepEqual(nombresPrivados({ para: 'Jordi Navarro <x@y.com>' }), ['Jordi', 'Navarro']);
    assert.deepEqual(nombresPrivados({ html: '<p>¡Hola Jordi!</p>' }), ['Jordi']);
    assert.deepEqual(nombresPrivados({ asunto: 'Jordi, tus ofertas' }), ['Jordi']);
    assert.deepEqual(nombresPrivados({ asunto: 'Roma, desde 29 €' }, ['Barcelona → Roma']), []);
  });

  it('quita emails, saludos y nombres', () => {
    assert.equal(limpiarTexto('Jordi, vuela a Roma desde 29,99 €', ['Jordi']), 'Vuela a Roma desde 29,99 €');
    assert.equal(limpiarTexto('Hola Jordi: mira estas ofertas', ['Jordi']), 'Mira estas ofertas');
    assert.equal(limpiarTexto(`Enviado a ${DESTINATARIO} hoy`), 'Enviado a hoy');
    assert.equal(limpiarTexto('Hotel Jordina en Girona', ['Jordi']), 'Hotel Jordina en Girona');
  });
});

// ---------------------------------------------------------------------------
// obtener() con un cliente IMAP y una red simulados
// ---------------------------------------------------------------------------

function mime({ de, para, asunto, fecha, html, messageId }) {
  const cuerpo = Buffer.from(html, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return Buffer.from([
    `From: ${de}`,
    `To: ${para}`,
    `Subject: =?UTF-8?B?${Buffer.from(asunto, 'utf8').toString('base64')}?=`,
    `Date: ${new Date(fecha).toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    cuerpo,
  ].join('\r\n'));
}

function clienteImapFalso(carpetas, { conectar = async () => {} } = {}) {
  const registro = { cerrojos: [], busquedas: [], liberados: 0, logout: 0, close: 0 };
  let actual = null;
  return {
    registro,
    usable: false,
    async connect() {
      await conectar();
      this.usable = true;
    },
    async list() {
      return [...Object.keys(carpetas), '[Gmail]/Enviados'].map((path) => ({ path, name: path }));
    },
    async getMailboxLock(path, opciones) {
      registro.cerrojos.push({ path, ...opciones });
      actual = path;
      return { release: () => { registro.liberados += 1; } };
    },
    async search(consulta, opciones) {
      registro.busquedas.push({ consulta, opciones });
      return carpetas[actual].map((_, i) => i + 1);
    },
    async* fetch(uids) {
      for (const uid of uids) yield { uid, source: carpetas[actual][uid - 1] };
    },
    async logout() {
      registro.logout += 1;
      this.usable = false;
    },
    close() {
      registro.close += 1;
      this.usable = false;
    },
  };
}

const ALERTA_GOOGLE = {
  de: 'Google <no-reply@accounts.google.com>', para: DESTINATARIO, asunto: 'Alerta de seguridad',
  fecha: '2026-09-17T12:00:00Z', html: '<p>Hola Jordi, se ha iniciado sesión. <a href="https://myaccount.google.com/notifications">Revisar</a> 0 €</p>',
  messageId: '<alerta@accounts.google.com>',
};
const ANTIGUO = { ...EMAILS.groupon, fecha: '2026-09-10T09:00:00Z', messageId: '<antiguo@r.groupon.es>' };

const carpetasDePrueba = () => ({
  INBOX: [mime(EMAILS.booking), mime(EMAILS.vueling), mime(ALERTA_GOOGLE), mime(ANTIGUO)],
  Ofertas: [mime(EMAILS.groupon), mime(EMAILS.vueling)],
});

// Rastreadores de las newsletters de ejemplo → URL de la oferta (con parámetros de seguimiento).
function saltoDePrueba(url) {
  const { host, searchParams } = new URL(url);
  const hoteles = { 223344: 'peralada', 556677: 'parador-de-cardona', 889900: 'roc-blanc-escaldes' };
  if (host === 'email.booking.com') {
    return { estado: 302, destino: `https://u123.ct.sendgrid.net/ls/click?upn=zzz&hotel_id=${searchParams.get('hotel_id')}` };
  }
  if (host === 'u123.ct.sendgrid.net') {
    return { estado: 301, destino: `https://www.booking.com/hotel/es/${hoteles[searchParams.get('hotel_id')]}.es.html?aid=304142&sid=9f8e#fotos` };
  }
  if (host === 'click.e.vueling.com') {
    const ruta = url.endsWith('01') || url.endsWith('02') ? 'vuelos-baratos/barcelona-roma' : url.endsWith('70') ? 'ofertas-vuelos' : 'vuelos-baratos/barcelona-amsterdam';
    return { estado: 302, destino: `https://www.vueling.com/es/${ruta}?utm_source=nl&cid=EM-1` };
  }
  if (host === 'links.groupon.es') {
    const deal = url.includes('ZGVhbD1ob3RlbC1sbG9yZXQ') ? 'hotel-lloret-de-mar-2' : 'andorra-escapada-3';
    return { estado: 302, destino: `https://www.groupon.es/deals/${deal}?utm_medium=email&uu=b3f1c2d4` };
  }
  return { estado: 200, destino: null };
}

function contextoObtener({ carpetas = carpetasDePrueba(), salto = saltoDePrueba, cache = new Cache(), cliente } = {}) {
  const base = crearCtx({ cache });
  const imap = cliente ?? clienteImapFalso(carpetas);
  const redirecciones = [];
  base.ctx.http.redireccion = async (url) => {
    redirecciones.push(url);
    return salto(url);
  };
  base.ctx.crearClienteImap = () => imap;
  return { ...base, imap, redirecciones };
}

describe('buzon: obtener', () => {
  it('lee INBOX y «Ofertas» en solo lectura, resuelve los enlaces y cierra la conexión', async () => {
    const { ctx, imap, redirecciones, esperas, logs } = contextoObtener();
    const { ofertas, reemplazar } = await fuente.obtener(ctx);

    assert.equal(reemplazar, undefined);
    assert.deepEqual(imap.registro.cerrojos, [{ path: 'INBOX', readOnly: true }, { path: 'Ofertas', readOnly: true }]);
    assert.equal(imap.registro.liberados, 2);
    assert.equal(imap.registro.logout, 1);
    const desde = imap.registro.busquedas[0].consulta.since;
    assert.equal(desde.toISOString(), new Date(AHORA.getTime() - 3 * 86_400_000).toISOString());

    // 3 de Booking + 4 de Vueling (repetido en las dos carpetas) + 3 de Groupon; ni la alerta ni el antiguo.
    assert.equal(ofertas.length, 10);
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
    assert.ok(logs.some((l) => /1 emails de remitentes no reconocidos/.test(l)));

    assert.equal(porTitulo(ofertas, 'Hotel Peralada').url, 'https://www.booking.com/hotel/es/peralada.es.html');
    assert.equal(porTitulo(ofertas, 'Parador de Cardona').url, 'https://www.booking.com/hotel/es/parador-de-cardona.es.html');
    assert.equal(porTitulo(ofertas, 'Barcelona → Roma').url, 'https://www.vueling.com/es/vuelos-baratos/barcelona-roma');
    assert.equal(porTitulo(ofertas, '¡Otoño en Europa!').url, 'https://www.vueling.com/es/ofertas-vuelos');
    assert.equal(porTitulo(ofertas, 'Costa Brava').url, 'https://www.groupon.es/deals/hotel-lloret-de-mar-2');
    sinDatosPersonales(ofertas);

    // 8 enlaces (3 Booking con 2 saltos, 3 Vueling y 2 Groupon); nunca se pide la web del comercio.
    assert.equal(redirecciones.length, 11);
    assert.ok(redirecciones.every((u) => !/^https:\/\/www\.(booking\.com|vueling\.com|groupon\.es)/.test(u)));
    assert.deepEqual(esperas, Array(7).fill(2000));
  });

  it('en la siguiente ejecución reutiliza los enlaces ya resueltos sin pedir nada', async () => {
    const cache = new Cache();
    const primera = await fuente.obtener(contextoObtener({ cache }).ctx);
    const { ctx, redirecciones } = contextoObtener({ cache });
    const segunda = await fuente.obtener(ctx);
    assert.equal(redirecciones.length, 0);
    assert.deepEqual(segunda.ofertas.map((o) => [o.id, o.url]), primera.ofertas.map((o) => [o.id, o.url]));
    assert.ok(!JSON.stringify(cache.exportar()).includes('upn='));
  });

  it('sigue como mucho 20 enlaces por ejecución', async () => {
    const tarjetas = (n) => Array.from({ length: 12 }, (_, i) => `<table><tr><td><a href="https://email.booking.com/ls/click?upn=${n}-${i}&hotel_id=223344">Hotel número ${n}-${i} en Girona</a> desde ${50 + i} € por noche</td></tr></table>`).join('');
    const email = (n) => mime({ ...EMAILS.booking, html: `<html><body>${tarjetas(n)}</body></html>`, messageId: `<lote-${n}@booking.com>` });
    const { ctx, redirecciones } = contextoObtener({ carpetas: { INBOX: [email(1), email(2)] }, salto: () => ({ estado: 301, destino: 'https://www.booking.com/hotel/es/peralada.es.html' }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(ofertas.length, 24);
    assert.equal(redirecciones.length, 20);
    assert.equal(ofertas.filter((o) => o.url === 'https://www.booking.com').length, 4);
  });

  it('ante un 403 deja de pedir y usa la portada', async () => {
    const { ctx, redirecciones, logs } = contextoObtener({ salto: () => ({ estado: 403, destino: null }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(redirecciones.length, 1);
    assert.equal(ofertas.length, 10);
    assert.ok(logs.some((l) => /anti-bot/.test(l)));
    assert.equal(porTitulo(ofertas, 'Hotel Peralada').url, 'https://www.booking.com');
  });

  it('sin ctx.http.redireccion usa la portada de cada comercio', async () => {
    const { ctx, logs } = contextoObtener();
    delete ctx.http.redireccion;
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(ofertas.length, 10);
    assert.ok(logs.some((l) => /redireccion no está disponible/.test(l)));
    sinDatosPersonales(ofertas);
  });

  it('explica el fallo de autenticación y cierra la conexión', async () => {
    const error = Object.assign(new Error('Command failed'), { authenticationFailed: true });
    const cliente = clienteImapFalso({}, { conectar: async () => { throw error; } });
    await assert.rejects(fuente.obtener(contextoObtener({ cliente }).ctx), /rechaza GMAIL_USER\/GMAIL_APP_PASSWORD/);
    assert.equal(cliente.registro.close, 1);
  });

  it('corta si el servidor IMAP no responde a tiempo', async () => {
    const cliente = clienteImapFalso({}, { conectar: () => new Promise(() => {}) });
    await assert.rejects(leerBuzon(cliente, { desde: AHORA, limiteMs: 20 }), /no ha respondido en 0.02 s/);
    assert.ok(cliente.registro.close >= 1);
  });

  it('declara los metadatos de la fuente', () => {
    assert.equal(fuente.id, 'buzon');
    assert.equal(fuente.modo, 'buzon');
    assert.deepEqual(fuente.requiere, ['GMAIL_USER', 'GMAIL_APP_PASSWORD']);
    assert.deepEqual(fuente.urls, []);
  });
});
