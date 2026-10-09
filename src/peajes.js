/**
 * Peajes conocidos de las rutas habituales (config/peajes.json), para que el viaje completo en
 * coche no diga «sin peajes» cuando la ruta normal tiene uno (el Túnel del Cadí hacia la Cerdanya
 * y Andorra desde Barcelona). Cada peaje: desde qué zona de salida cuenta (`desde` con su radio),
 * a qué zonas de destino lleva (`zonas`: una caja [sur, oeste, norte, este] o un `codigoPais`) y su
 * `importe` por trayecto y coche, o null si no se sabe: entonces el panel lo nombra sin sumarlo.
 */
import { cargarJson } from './almacen.js';

const esNumero = (n) => typeof n === 'number' && Number.isFinite(n);

/** Lo que está mal en la lista (vacío si vale). */
export function problemasPeajes(peajes) {
  if (!Array.isArray(peajes)) return ['peajes debe ser una lista'];
  return peajes.flatMap((p, i) => {
    const donde = `peajes[${i}]${p?.nombre ? ` (${p.nombre})` : ''}`;
    const problemas = [];
    if (!p || typeof p.nombre !== 'string' || !p.nombre.trim()) problemas.push(`${donde}: falta el nombre`);
    if (p?.importe != null && !(esNumero(p.importe) && p.importe > 0)) problemas.push(`${donde}: importe debe ser un número de euros o null`);
    const d = p?.desde;
    if (!d || !esNumero(d.lat) || !esNumero(d.lon) || !(esNumero(d.radioKm) && d.radioKm > 0)) problemas.push(`${donde}: desde debe ser {lat, lon, radioKm}`);
    const zonasBien = Array.isArray(p?.zonas) && p.zonas.length && p.zonas.every((z) => (typeof z?.codigoPais === 'string' && z.codigoPais.length === 2)
      || (Array.isArray(z?.caja) && z.caja.length === 4 && z.caja.every(esNumero) && z.caja[0] < z.caja[2] && z.caja[1] < z.caja[3]));
    if (!zonasBien) problemas.push(`${donde}: zonas debe ser una lista de {caja: [sur, oeste, norte, este]} o {codigoPais}`);
    return problemas;
  });
}

/** Los peajes del archivo, o [] si no está o está mal (con un aviso: no para el escaneo). */
export function cargarPeajes(ruta, log = console.warn) {
  try {
    const { peajes = [] } = cargarJson(ruta, {});
    const problemas = problemasPeajes(peajes);
    if (problemas.length) {
      log(`⚠️  ${ruta}: ${problemas.join('; ')}. Sin peajes en el viaje completo.`);
      return [];
    }
    return peajes;
  } catch (error) {
    log(`⚠️  ${ruta} no se puede leer (${error.message}): sin peajes en el viaje completo`);
    return [];
  }
}
