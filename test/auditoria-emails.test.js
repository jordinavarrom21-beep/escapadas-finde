/**
 * Un test por cada fallo que encontró la auditoría en los emails y los vigilados.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { estadoInicial } from '../src/almacen.js';
import { procesarEmails } from '../src/emails/decidir.js';
import { configuracionEnvio } from '../src/emails/enviar.js';
import { alertaChollazos, alertaVigilados, resumenSemanal } from '../src/emails/plantillas.js';
import { cargarVigilados, coincide, validarVigilado } from '../src/vigilados.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, AJUSTES, oferta } from './ayudas.js';

const CARPETA = mkdtempSync(path.join(tmpdir(), 'escapadas-vigilados-'));
after(() => rmSync(CARPETA, { recursive: true, force: true }));
let n = 0;
function cargar(contenido) {
  const ruta = path.join(CARPETA, `vigilados-${n++}.json`);
  writeFileSync(ruta, contenido);
  const avisos = [];
  return { vigilados: cargarVigilados(ruta, (m) => avisos.push(m)), avisos };
}

describe('auditoría: un vigilado mal escrito no tumba el escaneo', () => {
  it('JSON roto: avisa y sigue sin vigilados', () => {
    const { vigilados, avisos } = cargar('{"vigilados": [{"nombre": "x",}]}');
    assert.deepEqual(vigilados, []);
    assert.match(avisos[0], /no se puede leer.*esta vez sin vigilados/);
  });

  it('«vigilados» que no es una lista, o elementos que no son un criterio', () => {
    assert.deepEqual(cargar('{"vigilados": {"nombre": "x"}}').vigilados, []);
    const { vigilados, avisos } = cargar('{"vigilados": [null, 3, {"nombre": "Bueno"}]}');
    assert.deepEqual(vigilados, [{ nombre: 'Bueno' }]);
    assert.match(avisos[0], /2 elementos de «vigilados» no son un criterio/);
  });

  it('«temas» como texto avisa y no revienta al comparar', () => {
    const { vigilados, avisos } = cargar('{"vigilados": [{"nombre": "Spa", "temas": "spa"}]}');
    assert.match(avisos[0], /«temas» debe ser una lista/);
    assert.doesNotThrow(() => coincide(oferta({ temas: ['spa'] }), vigilados[0]));
  });
});

describe('auditoría: los criterios coinciden con lo que de verdad hay', () => {
  it('«aeropuerto» ya no deja muerto el vigilado: solo descarta vuelos con otro origen conocido', () => {
    const c = { nombre: 'Oporto', texto: 'oporto', tipo: 'vuelo', aeropuerto: 'BCN' };
    assert.ok(coincide(oferta({ tipo: 'vuelo', titulo: 'Vuelos a Oporto desde 20 €' }), c), 'sin origen publicado');
    assert.ok(coincide(oferta({ tipo: 'vuelo', titulo: 'Oporto', vuelo: { origen: 'BCN', destino: 'OPO' } }), { ...c, aeropuerto: 'bcn' }));
    assert.ok(!coincide(oferta({ tipo: 'vuelo', titulo: 'Oporto', vuelo: { origen: 'GRO', destino: 'OPO' } }), c));
  });

  it('«pais» con código compara el código; con nombre, el nombre entero', () => {
    const alemania = oferta({ lugar: { nombre: 'Berlín', pais: 'Alemania', codigoPais: null } });
    const portugal = oferta({ lugar: { nombre: 'Oporto', pais: 'Portugal', codigoPais: null } });
    assert.ok(!coincide(alemania, { nombre: 'x', pais: 'MA' }), '«MA» es Marruecos, no una subcadena de Alemania');
    assert.ok(coincide(portugal, { nombre: 'x', pais: 'PT' }), 'sin codigoPais, se deduce del nombre');
    assert.ok(coincide(alemania, { nombre: 'x', pais: 'alemania' }));
    assert.ok(!coincide(alemania, { nombre: 'x', pais: 'Alema' }));
  });

  it('«texto» busca palabras completas: «reus» no es «Santes Creus» ni «sort» un «resort»', () => {
    assert.ok(!coincide(oferta({ titulo: 'Monasterio de Santes Creus' }), { nombre: 'x', texto: 'reus' }));
    assert.ok(!coincide(oferta({ titulo: 'Ecoresort en Begur' }), { nombre: 'x', texto: 'sort' }));
    assert.ok(coincide(oferta({ titulo: 'Hotel en Reus centro' }), { nombre: 'x', texto: 'reus' }));
    assert.ok(coincide(oferta({ titulo: 'Escapada a Sort (Pallars)' }), { nombre: 'x', texto: 'Sort' }));
  });

  it('«finde» acepta la fecha real del puente y también el «puente-…» que documentaba el leeme', () => {
    const o = oferta({ fechas: { salida: '2026-12-05', puenteId: '2026-12-05' } });
    assert.ok(coincide(o, { nombre: 'x', finde: '2026-12-05' }));
    assert.ok(coincide(o, { nombre: 'x', finde: 'puente-2026-12-05' }));
  });

  it('validarVigilado avisa de lo que no coincidiría nunca', () => {
    const problemas = (c) => validarVigilado({ nombre: 'x', ...c }).join(' | ');
    assert.match(problemas({ aeropuerto: 'Barcelona' }), /código IATA de 3 letras/);
    assert.match(problemas({ finde: 'el puente' }), /fecha de un finde o de un puente/);
    assert.match(problemas({ noches: { min: 3, max: 2 } }), /min es mayor que max/);
    assert.match(problemas({ cerca: { lat: 41, lon: 2, radioKm: -5 } }), /radioKm debe ser mayor que 0/);
    assert.match(validarVigilado({ nombre: 'Oporto | Lisboa' }).join(), /no puede llevar «\|»/);
  });
});

describe('auditoría: lo que dicen los emails', () => {
  const muchas = Array.from({ length: 10 }, (_, i) => oferta({ titulo: `Oferta ${i}`, precio: 50 + i, puntuacion: 90 }));

  it('si no caben todas, dice cuántas más hay en el panel', () => {
    assert.match(alertaChollazos({ ofertas: muchas, panelUrl: 'https://x' }).texto, /Y 4 más en el panel\./);
    const vigilados = alertaVigilados({ coincidencias: muchas.map((o) => ({ criterio: { nombre: 'Todo' }, oferta: o, anterior: null })), panelUrl: 'https://x' });
    assert.match(vigilados.texto, /Y 4 más en el panel\./);
  });

  it('un primer aviso no se llama «bajada»', () => {
    const nuevas = alertaVigilados({ coincidencias: [{ criterio: { nombre: 'Spa' }, oferta: muchas[0], anterior: null }], panelUrl: 'https://x' });
    assert.match(nuevas.asunto, /^⭐ Novedades en tus vigilados: Spa$/);
    const bajada = alertaVigilados({ coincidencias: [{ criterio: { nombre: 'Spa' }, oferta: muchas[0], anterior: 80 }], panelUrl: 'https://x' });
    assert.match(bajada.asunto, /^⭐ Bajada en tus vigilados/);
  });

  it('el resumen del viernes: el vuelo más barato en el asunto y sin actividades entre las escapadas', () => {
    const findes = findesProximos(2, AHORA);
    const vuelos = [
      oferta({ tipo: 'vuelo', titulo: 'Roma', precio: 32, puntuacion: 90 }),
      oferta({ tipo: 'vuelo', titulo: 'Oporto', precio: 9, puntuacion: 40 }),
    ];
    const tour = oferta({ tipo: 'actividad', titulo: 'Free tour por Barcelona', precio: 0, puntuacion: 99 });
    const casa = oferta({ tipo: 'hotel', titulo: 'Casa rural', precio: 90, puntuacion: 70 });
    const { asunto, texto } = resumenSemanal({ ofertas: [...vuelos, tour, casa], findes, puentes: [], ajustes: AJUSTES, panelUrl: 'https://x', ahora: AHORA });
    assert.match(asunto, /vuelos desde 9,00\s€ y 1 escapada$/);
    const escapadas = texto.split('== 🏨 Las mejores escapadas ==')[1].split('==')[0];
    assert.ok(!escapadas.includes('Free tour'));
  });

  it('un «|» en el nombre del vigilado no hace que se repita el aviso', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    const casa = oferta({ id: 'feed:1', fuente: 'feed', titulo: 'Casa en Cadaqués', precio: 120 });
    const base = { ajustes: AJUSTES, vigilados: [{ nombre: 'Cadaqués | Roses', texto: 'cadaques' }], findes: findesProximos(2, AHORA), puentes: [], fuentes: [], panelUrl: 'https://x', log: () => {} };
    const enviados = [];
    const enviar = async (m) => { enviados.push(m.asunto); };
    await procesarEmails({ ...base, ofertas: [casa], estado, enviar, ahora: new Date('2026-09-17T08:00:00Z') });
    await procesarEmails({ ...base, ofertas: [casa], estado, enviar, ahora: new Date('2026-10-20T08:00:00Z') });
    assert.equal(enviados.filter((a) => a.startsWith('⭐')).length, 1);
  });

  it('con SMTP, SMTP_FROM es el remitente cuando el usuario no es una dirección', () => {
    const config = configuracionEnvio({ SMTP_HOST: 'smtp.sendgrid.net', SMTP_USER: 'apikey', SMTP_PASS: 'x', SMTP_FROM: 'avisos@midominio.es', EMAIL_TO: 'yo@x.es' });
    assert.equal(config.remitente, 'avisos@midominio.es');
    assert.equal(configuracionEnvio({ SMTP_HOST: 'h', SMTP_USER: 'yo@x.es', SMTP_PASS: 'p', EMAIL_TO: 'yo@x.es' }).remitente, 'yo@x.es');
  });
});
