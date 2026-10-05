/**
 * Quién está detrás de la web, para el aviso legal (LSSI, art. 10) y la privacidad (RGPD):
 * config/ajustes.json → «legal»: {titular, nif, domicilio, email}. Una web con enlaces de
 * afiliado o anuncios tiene que decir quién es y cómo contactar. Los datos los pone el dueño;
 * aquí no se inventa nada: sin titular o sin email, el panel no enseña datos de nadie.
 */
const CAMPOS = ['titular', 'nif', 'domicilio', 'email'];
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Lo que está mal en «legal» (vacío si vale o si no está). */
export function problemasLegal(legal) {
  if (legal == null) return [];
  if (typeof legal !== 'object' || Array.isArray(legal)) return ['legal debe ser un objeto {titular, nif, domicilio, email}'];
  const problemas = CAMPOS.filter((campo) => legal[campo] != null && typeof legal[campo] !== 'string').map((campo) => `legal.${campo} debe ser un texto`);
  if (typeof legal.email === 'string' && legal.email.trim() && !EMAIL.test(legal.email.trim())) problemas.push(`legal.email no parece un email (ahora: ${legal.email})`);
  return problemas;
}

/** Lo que sale en el panel: los campos con texto, o null si falta el titular o el email. */
export function legalParaPanel(legal) {
  if (problemasLegal(legal).length || !legal) return null;
  const limpio = Object.fromEntries(CAMPOS.map((campo) => [campo, typeof legal[campo] === 'string' ? legal[campo].trim() : '']).filter(([, valor]) => valor));
  return limpio.titular && limpio.email ? limpio : null;
}
