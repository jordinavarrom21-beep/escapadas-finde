/**
 * Google Analytics 4 (opcional), una sola regla para la validación de config/ajustes.json y el
 * despliegue (scripts/preparar-web.js): `"googleAnalytics": "G-XXXXXXXXXX"`, el ID de medición
 * del flujo de datos web (Administrar → Flujos de datos). No es un secreto: va en la página.
 *
 * Solo con permiso: va en el mismo aviso de cookies que Google Ads y Drive (site/js/consentimiento.js)
 * y no se carga nada de Google hasta que el visitante acepta la medición. Vacío: no hay analítica.
 */
const ID = /^G-[A-Z0-9]{4,}$/;

/**
 * Lo que está mal en `googleAnalytics` (vacío si vale, también si no está).
 * @returns {string[]}
 */
export function problemasGoogleAnalytics(googleAnalytics) {
  if (googleAnalytics == null || googleAnalytics === '') return [];
  if (typeof googleAnalytics !== 'string' || !ID.test(googleAnalytics.trim())) {
    return [`googleAnalytics debe ser el ID de medición de Google Analytics 4 («G-» y letras y números, p. ej. "G-AB12CD34EF") o "" (ahora: ${googleAnalytics})`];
  }
  return [];
}

/** El ID listo para usar, o null sin analítica o si está mal. */
export function normalizarGoogleAnalytics(googleAnalytics) {
  if (problemasGoogleAnalytics(googleAnalytics).length) return null;
  return typeof googleAnalytics === 'string' && googleAnalytics.trim() ? googleAnalytics.trim() : null;
}
