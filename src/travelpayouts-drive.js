/**
 * Travelpayouts Drive (opcional): su script convierte en enlaces de afiliado, al pulsarlos,
 * los enlaces a las webs que tiene en su programa (Booking, GetYourGuide, Omio…). Una sola
 * regla para validar config/ajustes.json («travelpayoutsDrive») y para el despliegue.
 *
 * `{script: "https://…/….js?…", dominiosExtra: ["https://…"]}`: `script` es la dirección
 * del `<script>` que da Travelpayouts al instalar Drive (se ve en su panel; no es secreta).
 * Con `script` vacío no hay Drive. `dominiosExtra`: otros orígenes a los que llama el script,
 * si la consola del navegador avisa de que la CSP los bloquea.
 */
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : valor == null ? '' : null);

/** Un origen https («https://dominio.tld»), o null si no lo es. */
function origenHttps(valor) {
  if (typeof valor !== 'string' || !URL.canParse(valor.trim())) return null;
  const url = new URL(valor.trim());
  return url.protocol === 'https:' && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) && !url.username && !url.password ? url.origin : null;
}

/** Lo que está mal en `travelpayoutsDrive` (vacío si vale, también si no está). */
export function problemasDrive(drive) {
  if (drive == null) return [];
  if (typeof drive !== 'object' || Array.isArray(drive)) return ['travelpayoutsDrive debe ser un objeto {script, dominiosExtra}'];
  const problemas = [];
  const script = texto(drive.script);
  if (script === null || (script !== '' && !origenHttps(script))) {
    problemas.push(`travelpayoutsDrive.script debe ser la dirección https del script de Drive (la de su panel) o "" (ahora: ${drive.script})`);
  }
  const extra = drive.dominiosExtra ?? [];
  if (!Array.isArray(extra) || extra.some((d) => !origenHttps(d))) {
    problemas.push('travelpayoutsDrive.dominiosExtra debe ser una lista de orígenes https, p. ej. ["https://tp.media"]');
  }
  return problemas;
}

/** `{script, origenes}` listo para usar, o null sin Drive o si está mal. */
export function normalizarDrive(drive) {
  if (problemasDrive(drive).length) return null;
  const script = texto(drive?.script);
  if (!script) return null;
  const origenes = [...new Set([origenHttps(script), ...(drive.dominiosExtra ?? []).map(origenHttps)])];
  return { script, origenes };
}
