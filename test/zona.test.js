import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarZona, zonaDe } from '../src/enriquecer/zona.js';
import { coincide } from '../src/vigilados.js';
import { buscarEscapadas, leerFiltrosEscapadas, zonasDe } from '../site/js/filtros.js';
import { oferta } from './ayudas.js';

const lugar = (nombre, region, pais = 'España') => ({ nombre, region, pais, codigoPais: pais === 'España' ? 'ES' : null, lat: null, lon: null });

describe('zona: provincia y comunidad a partir de lo que dice cada web', () => {
  it('provincias, «Provincia de…», exónimos, comarcas y zonas turísticas', () => {
    const casos = [
      [lugar('Lloret de Mar', 'Costa Brava'), 'Girona', 'Cataluña'],
      [lugar('Pals', 'Baix Empordà'), 'Girona', 'Cataluña'],
      [lugar('Tossa de Mar', 'Provincia de Gerona'), 'Girona', 'Cataluña'],
      [lugar('Vielha', 'el Valle de Aran'), 'Lleida', 'Cataluña'],
      [lugar('Cambrils', 'Costa Dorada'), 'Tarragona', 'Cataluña'],
      [lugar('Palma', 'Mallorca'), 'Islas Baleares', 'Islas Baleares'],
      [lugar('Valencia', 'València'), 'Valencia', 'Comunidad Valenciana'],
      [lugar('Girona', null), 'Girona', 'Cataluña'],
    ];
    for (const [l, provincia, comunidad] of casos) assert.deepEqual(zonaDe(l), { provincia, comunidad }, `${l.nombre} · ${l.region}`);
  });

  it('solo la comunidad cuando la web solo da eso o una zona de varias provincias', () => {
    assert.deepEqual(zonaDe(lugar('Lloret de Mar', 'Cataluña')), { provincia: null, comunidad: 'Cataluña' });
    assert.deepEqual(zonaDe(lugar('Bossòst', 'Pirineo Catalan')), { provincia: null, comunidad: 'Cataluña' });
    assert.deepEqual(zonaDe(lugar('X', 'Pais Vasco-Euskadi')), { provincia: null, comunidad: 'País Vasco' });
  });

  it('no inventa nada: fuera de España, o sin región reconocible', () => {
    assert.deepEqual(zonaDe(lugar('Roma', 'Lazio', 'Italia')), { provincia: null, comunidad: null });
    assert.deepEqual(zonaDe(lugar('Benasque', 'Pirineos')), { provincia: null, comunidad: null });
    assert.deepEqual(zonaDe(null), { provincia: null, comunidad: null });
  });
});

describe('zona: filtros y vigilados encuentran lo mismo lo escriba como lo escriba cada web', () => {
  const weekendesk = aplicarZona(oferta({ fuente: 'weekendesk', titulo: 'Lloret', lugar: lugar('Lloret de Mar', 'Cataluña') }));
  const atrapalo = aplicarZona(oferta({ fuente: 'atrapalo', titulo: 'Pals', lugar: lugar('Pals', 'Baix Empordà') }));
  const nomolesten = aplicarZona(oferta({ fuente: 'nomolesten', titulo: 'Girona', lugar: lugar('Girona', 'Girona') }));
  const ofertas = [weekendesk, atrapalo, nomolesten];
  const buscar = (params) => buscarEscapadas(ofertas, leerFiltrosEscapadas(params), { origen: { lat: 41.39, lon: 2.17 } }).ofertas.map((o) => o.fuente).sort();

  it('filtrar por la provincia encuentra también la comarca; por la comunidad, todo', () => {
    assert.deepEqual(buscar({ region: 'Girona' }), ['atrapalo', 'nomolesten']);
    assert.deepEqual(buscar({ region: 'Cataluña' }), ['atrapalo', 'nomolesten', 'weekendesk']);
  });

  it('el desplegable ofrece provincias y comunidades, no los textos sueltos de cada web', () => {
    assert.deepEqual(zonasDe(ofertas), { provincias: ['Girona'], comunidades: ['Cataluña'] });
  });

  it('un vigilado con «region» vale para la provincia y la comunidad', () => {
    assert.ok(coincide(atrapalo, { nombre: 'x', region: 'Girona' }));
    assert.ok(coincide(weekendesk, { nombre: 'x', region: 'Cataluña' }));
    assert.ok(!coincide(weekendesk, { nombre: 'x', region: 'Girona' }), 'Weekendesk no dice la provincia: no se inventa');
  });
});
