/**
 * Google Ads (opcional), una sola regla para la validación de config/ajustes.json y el
 * despliegue (scripts/preparar-web.js): `{id: 'AW-123…', conversion: 'AW-123…/etiqueta'}`.
 * Con `id` vacío no hay Google Ads ni aviso de cookies.
 */
const ID = /^AW-\d+$/;
const CONVERSION = /^AW-\d+\/[\w-]+$/;
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : valor == null ? '' : null);

/**
 * Lo que está mal en `googleAds` (vacío si vale, también si no está).
 * @returns {string[]}
 */
export function problemasGoogleAds(googleAds) {
  if (googleAds == null) return [];
  if (typeof googleAds !== 'object' || Array.isArray(googleAds)) return ['googleAds debe ser un objeto {id, conversion}'];
  const id = texto(googleAds.id);
  const conversion = texto(googleAds.conversion);
  const problemas = [];
  if (id === null || (id !== '' && !ID.test(id))) problemas.push(`googleAds.id debe ser el ID de Google Ads («AW-» y números) o "" (ahora: ${googleAds.id})`);
  else if (conversion === null || (conversion !== '' && !(id !== '' && conversion.startsWith(`${id}/`) && CONVERSION.test(conversion)))) {
    problemas.push(`googleAds.conversion debe ser «${id || 'AW-…'}/etiqueta» (la de la acción de conversión de esa cuenta) o "" (ahora: ${googleAds.conversion})`);
  }
  return problemas;
}

/** `{id, conversion}` listo para usar (conversion puede ser null), o null sin Google Ads o si está mal. */
export function normalizarGoogleAds(googleAds) {
  if (problemasGoogleAds(googleAds).length) return null;
  const id = texto(googleAds?.id);
  if (!id) return null;
  return { id, conversion: texto(googleAds.conversion) || null };
}
