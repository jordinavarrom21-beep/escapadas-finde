/**
 * Webs, canales y boletines que también publican chollos: eligen ofertas de otras webs y las
 * describen a su manera. Mientras no se revisen sus condiciones de uso, de sus ofertas el panel
 * enseña solo título, precio y enlace (src/panel-datos.js): ni su descripción ni el resumen que
 * se escribe a partir de ella, ni sus etiquetas propias («Top chollo»), que son su trabajo de
 * selección. El escaneo sí lee su texto para clasificar la oferta (fechas, temas, estrellas…).
 */
export const WEBS_DE_CHOLLOS = new Set([
  'chollometro', 'viajerospiratas', 'buscounchollo', 'holidayguru', 'fly4free', 'exprimeviajes', 'escapadabarata', 'buzon',
]);

/** ¿Es una oferta de una web de chollos? */
export const deWebDeChollos = (oferta) => WEBS_DE_CHOLLOS.has(oferta.fuente);
