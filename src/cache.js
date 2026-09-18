/**
 * Caché clave-valor con caducidad, persistida en data/cache.json entre
 * ejecuciones (aeropuertos, festivos, geocodificación, rutas en coche…).
 * Convención de claves: «<módulo>:<detalle>», p. ej. «geo:Lisboa, Portugal».
 */
export class Cache {
  /** @param {Record<string, {t: number, v: unknown}>} [datos] */
  constructor(datos = {}) {
    this.datos = datos;
  }

  /** Valor guardado si existe y no es más antiguo que `maxEdadMs`; si no, undefined. */
  obtener(clave, maxEdadMs = Infinity, ahora = Date.now()) {
    const entrada = this.datos[clave];
    if (!entrada || ahora - entrada.t > maxEdadMs) return undefined;
    return entrada.v;
  }

  guardar(clave, valor, ahora = Date.now()) {
    this.datos[clave] = { t: ahora, v: valor };
  }

  /** Elimina las entradas más antiguas que `maxEdadMs`. */
  podar(maxEdadMs, ahora = Date.now()) {
    for (const [clave, entrada] of Object.entries(this.datos)) {
      if (ahora - entrada.t > maxEdadMs) delete this.datos[clave];
    }
  }

  exportar() {
    return this.datos;
  }
}
