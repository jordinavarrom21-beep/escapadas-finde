/**
 * Travelpayouts Drive (opcional), una sola regla para la validación de config/ajustes.json y
 * el despliegue (scripts/preparar-web.js): `"travelpayoutsDrive": "https://emrldco.com/….js?t=…"`,
 * la dirección («src») del código que da Travelpayouts en Drive → instalación manual. Ese
 * script convierte en enlaces de afiliado los enlaces a las marcas de su red.
 *
 * Solo con permiso: Drive deja una cookie de sesión propia (am_user_session) y lee las de
 * analítica, así que va en el mismo aviso de cookies que Google Ads (site/js/consentimiento.js) y
 * no se carga hasta que el visitante pulsa «Aceptar». Vacío o sin poner: no se carga nada.
 */
const SCRIPT = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/[\w./-]+\.js(\?[\w=&%-]*)?$/i;

/**
 * Lo que está mal en `travelpayoutsDrive` (vacío si vale, también si no está).
 * @returns {string[]}
 */
export function problemasDrive(drive) {
  if (drive == null || drive === '') return [];
  if (typeof drive !== 'string' || !SCRIPT.test(drive.trim())) {
    return [`travelpayoutsDrive debe ser la dirección del script de Drive («https://emrldco.com/….js?t=…», la del código de Travelpayouts) o "" (ahora: ${drive})`];
  }
  return [];
}

/** La dirección del script lista para usar, o null sin Drive o si está mal. */
export function normalizarDrive(drive) {
  if (problemasDrive(drive).length) return null;
  return typeof drive === 'string' && drive.trim() ? drive.trim() : null;
}
