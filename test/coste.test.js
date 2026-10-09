import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { costeViaje, resumenCoste } from '../site/js/coste.js';
import { aeropuertosCercanos, salidaEfectiva, validarSalida, validarViaje } from '../site/js/viaje.js';

const COCHE = { consumoL100km: 6.5, precioLitro: 1.8 };
const cerca = { km: 100, kmCoche: 125, minutos: 90, estimado: false };

describe('coste del viaje completo', () => {
  it('casa entera por noche + gasolina: suma, separa lo estimado y dice lo supuesto', () => {
    const c = costeViaje({ tipo: 'hotel', precio: 120, unidad: 'noche', noches: null }, { viajeros: 4, noches: 2, distancia: cerca, coche: COCHE });
    assert.deepEqual(c.partes.map((p) => [p.concepto, p.eur, p.estimado]), [
      ['Alojamiento', 240, false],
      ['Gasolina (ida y vuelta)', 29.25, true], // 250 km × 6,5 l/100 km = 16,25 l × 1,80 €
    ]);
    assert.equal(c.total, 269.25);
    assert.equal(c.porPersona, 67.31);
    assert.equal(c.estimado, 29.25);
    assert.deepEqual(c.falta, []);
    assert.ok(c.supuestos.some((s) => s.startsWith('2 noches (la oferta no lo fija)')));
    assert.ok(c.supuestos.some((s) => /sin aparcamiento/.test(s)));
    assert.ok(c.supuestos.includes('sin peajes'), 'sin peajes conocidos en la ruta');
    assert.deepEqual(c.aviso, []);
    assert.equal(resumenCoste(c), '≈ 269 € en total para 4 personas · 67 €/persona');
  });

  it('por persona y noche usa las noches de la oferta y los viajeros elegidos', () => {
    const c = costeViaje({ tipo: 'hotel', precio: 30, unidad: 'pp/noche', noches: 3 }, { viajeros: 2, noches: 2, distancia: cerca, coche: COCHE });
    assert.equal(c.partes[0].eur, 180);
    assert.equal(c.noches, 3);
  });

  it('sin la distancia desde la salida estima la carretera con la línea recta', () => {
    const c = costeViaje({ tipo: 'escapada', precio: 99, unidad: 'total' }, { viajeros: 2, distancia: { km: 100, kmCoche: null, minutos: 98 }, coche: COCHE });
    assert.equal(c.partes[1].detalle, '260 km · 16,9 l');
    assert.ok(c.supuestos.some((s) => /distancia por carretera estimada/.test(s)));
    assert.ok(c.supuestos.some((s) => /comprueba para cuántas personas/.test(s)));
  });

  it('un paquete con avión lo incluye; una escapada «en tren» no sabe cuánto cuesta el billete', () => {
    const paquete = costeViaje({ tipo: 'paquete', precio: 199, unidad: 'pp', transporte: 'avion' }, { viajeros: 2 });
    assert.equal(paquete.total, 398);
    assert.equal(paquete.estimado, 0);
    assert.equal(resumenCoste(paquete), '398 € en total para 2 personas · 199 €/persona', 'sin «≈»: no hay nada estimado');
    const tren = costeViaje({ tipo: 'escapada', precio: 80, unidad: 'pp', transporte: 'tren' }, { viajeros: 2, distancia: cerca, coche: COCHE });
    assert.equal(tren.total, null);
    assert.deepEqual(tren.falta, ['el precio del tren']);
  });

  it('un billete de trayecto estima la vuelta al mismo precio y avisa de que falta el alojamiento', () => {
    const c = costeViaje({ tipo: 'escapada', precio: 25.49, unidad: 'trayecto', transporte: 'bus' }, { viajeros: 2 });
    assert.deepEqual(c.partes.map((p) => [p.concepto, p.eur, p.estimado]), [['Billetes de ida', 50.98, false], ['Billetes de vuelta', 50.98, true]]);
    assert.deepEqual(c.falta, ['el alojamiento']);
    assert.equal(c.total, null, 'sin alojamiento no es el total del plan');
  });

  it('sin precio, sin unidad o sin forma de llegar, no hay total', () => {
    assert.deepEqual(costeViaje({ tipo: 'hotel', precio: null }).falta, ['el precio']);
    assert.deepEqual(costeViaje({ tipo: 'hotel', precio: 90, unidad: null }).falta, ['si el precio es por persona, por noche o total']);
    const isla = costeViaje({ tipo: 'hotel', precio: 90, unidad: 'noche' }, { distancia: { km: 200, kmCoche: null, minutos: null }, coche: COCHE });
    assert.deepEqual(isla.falta, ['cómo llegar (no hay ruta en coche calculada)']);
    assert.equal(resumenCoste(isla), '');
  });
});

describe('tu viaje: salida, viajeros y noches', () => {
  it('aeropuertos a menos de 150 km, del más cercano al más lejano', () => {
    assert.deepEqual(aeropuertosCercanos({ lat: 41.98, lon: 2.82 }), ['GRO', 'PGF', 'BCN'], 'desde Girona (Reus queda a más de 150 km)');
    assert.deepEqual(aeropuertosCercanos({ lat: 40.42, lon: -3.7 }), ['MAD']);
    assert.deepEqual(aeropuertosCercanos(null), []);
  });

  it('valida lo guardado en el navegador', () => {
    assert.deepEqual(validarSalida({ nombre: ' Girona <b>', lat: '41.98', lon: 2.82 }), { nombre: 'Girona b', lat: 41.98, lon: 2.82 });
    assert.equal(validarSalida({ nombre: 'X', lat: 200, lon: 0 }), null);
    assert.equal(validarSalida('Girona'), null);
    assert.deepEqual(validarViaje({ viajeros: '4', noches: 3 }), { viajeros: 4, noches: 3 });
    assert.deepEqual(validarViaje({ viajeros: 0, noches: 99 }, 3), { viajeros: 3, noches: 2 });
  });

  it('la salida en el origen del escaneo no es una salida distinta', () => {
    const origen = { nombre: 'Barcelona', lat: 41.3874, lon: 2.1686 };
    assert.equal(salidaEfectiva({ nombre: 'Barcelona', lat: 41.39, lon: 2.17 }, origen), null);
    assert.deepEqual(salidaEfectiva({ nombre: 'Girona', lat: 41.98, lon: 2.82 }, origen), { nombre: 'Girona', lat: 41.98, lon: 2.82 });
  });
});
