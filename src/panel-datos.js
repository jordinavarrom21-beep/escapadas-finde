/**
 * Datos del panel en dos archivos para que la primera carga sea ligera:
 *  - ofertas.json: todo lo que usan las tarjetas, los filtros y el mapa;
 *  - detalles.json: lo que solo se ve al abrir una ficha (los enlaces de «Organiza el
 *    viaje» y «Comparar precios», y los eventos de la zona), `{id: {enlaces, eventos}}`.
 * Y version.json, con la fecha del escaneo, para mirar si hay datos nuevos sin bajarlos.
 */

/** Campos que solo usa la ficha. */
export const CAMPOS_DETALLE = ['enlaces', 'eventos'];

/**
 * @param {{generado: string, ofertas: object[]}} datos lo que era ofertas.json
 * @returns {{ofertas: object, detalles: Record<string, object>, version: {generado: string}}}
 */
export function separarDatosPanel(datos) {
  const detalles = {};
  const ofertas = datos.ofertas.map((oferta) => {
    const ligera = { ...oferta };
    const detalle = {};
    for (const campo of CAMPOS_DETALLE) {
      if (ligera[campo]?.length) detalle[campo] = ligera[campo];
      delete ligera[campo];
    }
    // El enlace de reserva solo si no es el mismo de la oferta (el panel usa urlReserva ?? url).
    if (ligera.urlReserva === ligera.url) delete ligera.urlReserva;
    if (Object.keys(detalle).length) detalles[oferta.id] = detalle;
    return ligera;
  });
  return { ofertas: { ...datos, ofertas }, detalles, version: { generado: datos.generado } };
}
