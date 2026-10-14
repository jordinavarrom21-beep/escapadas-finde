/**
 * Auditoría de octubre de 2026: un test por cada fallo de seguridad o privacidad que se ha
 * corregido. Todos fallan sin su arreglo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { comercioDe, limpiarTexto, remitenteVerificado } from '../src/fuentes/buzon.js';
import { rutaDestino } from '../src/fuentes/clubrural.js';

describe('auditoría de octubre: remitentes del buzón', () => {
  const capfun = comercioDe('ofertas@capfun.es');
  const verificado = (autenticacion) => remitenteVerificado({ autenticacion }, capfun);

  test('las cabeceras de Gmail de verdad siguen valiendo', () => {
    assert.equal(verificado('mx.google.com; dkim=pass header.i=@capfun.es header.s=s1 header.b=Ab/Cd+E1; spf=pass (google.com: domain of b@capfun.es designates 1.2.3.4 as permitted sender) smtp.mailfrom=b@capfun.es; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=capfun.es'), true);
    assert.equal(verificado('mx.google.com; dkim=pass header.i=@esp.example header.s=s1; spf=pass (google.com: domain of b@capfun.es designates 1.2.3.4 as permitted sender) smtp.mailfrom=b@capfun.es; dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=capfun.es; dara=pass header.i=@gmail.com'), true);
    assert.equal(verificado('mx.google.com; spf=pass smtp.mailfrom=b@capfun.es; dmarc=pass (p=REJECT) header.from=capfun.es'), true);
  });

  test('un «dkim=pass» o «dmarc=pass» metido en la dirección de envío o en un comentario no suplanta al comercio', () => {
    const falsas = {
      'en la dirección (dot-atom)': 'mx.google.com; spf=pass (google.com: domain of dkim=pass.header.d=capfun.es@evil.example designates 203.0.113.5 as permitted sender) smtp.mailfrom="dkim=pass.header.d=capfun.es@evil.example"; dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=capfun.es',
      'entre comillas con «)» y «;»': 'mx.google.com; spf=pass (google.com: domain of "x) ; dkim=pass header.d=capfun.es ; dmarc=pass header.from=capfun.es ; none=none ("@evil.example designates 1.2.3.4 as permitted sender) smtp.mailfrom="x) ; dkim=pass header.d=capfun.es ; dmarc=pass header.from=capfun.es ; none=none ("@evil.example; dmarc=fail (p=NONE) header.from=capfun.es',
      'entre comillas, sin DMARC': 'mx.google.com; spf=pass (google.com: domain of "x) ; dkim=pass header.d=capfun.es ; none=none ("@evil.example designates 1.2.3.4 as permitted sender) smtp.mailfrom="x) ; dkim=pass header.d=capfun.es ; none=none ("@evil.example',
      'dmarc falso entre comillas': 'mx.google.com; spf=pass (google.com: domain of "x) ; dmarc=pass header.from=capfun.es ; none=none ("@evil.example designates 1.2.3.4 as permitted sender) smtp.mailfrom="x) ; dmarc=pass header.from=capfun.es ; none=none ("@evil.example',
      'paréntesis sin cerrar': 'mx.google.com; dkim=pass header.d=capfun.es (sin cerrar',
      '«)» escapado en un comentario': 'mx.google.com; spf=pass (domain of x\\) ; dkim=pass header.d=capfun.es) smtp.mailfrom=x@evil.example; dmarc=fail header.from=capfun.es',
    };
    for (const [caso, cabecera] of Object.entries(falsas)) assert.equal(verificado(cabecera), false, caso);
  });
});

describe('auditoría de octubre: datos personales y enlaces', () => {
  test('los códigos de socio o personales se quitan; un código de descuento para todos, no', () => {
    assert.equal(limpiarTexto('Desde 142 € por noche. Socio Genius nº GN4471982B · Usa tu código personal XK7P9Q2M antes del domingo.'),
      'Desde 142 € por noche. Socio Genius nº · Usa tu código personal antes del domingo.');
    assert.equal(limpiarTexto('Nº de cliente: AB12C34'), 'Nº de cliente');
    assert.equal(limpiarTexto('Usa el código WINTER26 y ahorra un 15 %'), 'Usa el código WINTER26 y ahorra un 15 %');
    assert.equal(limpiarTexto('Si eres socio no pagas comisión'), 'Si eres socio no pagas comisión');
  });

  test('Clubrural: una ruta «//otra.web/…» o «/\\otra.web/…» no lleva fuera de Clubrural', () => {
    const base64 = (texto) => Buffer.from(texto).toString('base64');
    assert.equal(rutaDestino(base64('//evil.example/phish')), null);
    assert.equal(rutaDestino(base64('/\\evil.example/x')), null);
    assert.equal(rutaDestino(base64('/s/Lleida?includeOfferIds=7')).href, 'https://www.clubrural.com/s/Lleida?includeOfferIds=7');
  });
});
