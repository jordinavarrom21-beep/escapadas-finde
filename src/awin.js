/**
 * Awin sin tocar nada a mano: con tu clave de la API (secreto AWIN_API_TOKEN, nunca en el
 * repositorio), el escaneo pregunta a Awin en qué programas te han aceptado y activa la
 * afiliación de las webs que coinciden por dominio, con su número de anunciante («awinmid»).
 * Si un programa no está en config/afiliacion.json, se añade con sus dominios. Sin clave, o si
 * Awin no responde, todo sigue como en la configuración.
 */

/** Se pregunta como mucho cada tantas horas: los programas aceptados cambian poco. */
const CADUCIDAD_MS = 12 * 60 * 60 * 1000;
const CLAVE_CACHE = 'awin:programas';

const dominioLimpio = (texto) => {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  const valor = texto.trim().toLowerCase();
  try {
    return new URL(valor.includes('://') ? valor : `https://${valor}`).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
};

/** Lo que importa de cada programa de la API: su número y sus dominios. */
export function programasDeRespuesta(respuesta) {
  const lista = Array.isArray(respuesta) ? respuesta : [];
  return lista
    .filter((p) => /^\d+$/.test(String(p?.id ?? '')))
    .map((p) => ({
      id: String(p.id),
      nombre: typeof p.name === 'string' ? p.name : String(p.id),
      dominios: [...new Set([...(p.validDomains ?? []).map((d) => dominioLimpio(d?.domain)), dominioLimpio(p.displayUrl)].filter(Boolean))],
    }))
    .filter((p) => p.dominios.length);
}

/**
 * Los programas de Awin en los que te han aceptado («joined»), o null si no hay clave o Awin
 * no responde (se avisa y se sigue con la configuración). La clave va en la cabecera: nunca
 * en la URL ni en los registros.
 */
export async function programasAwin(ctx, afiliado) {
  const token = ctx.env?.AWIN_API_TOKEN?.trim();
  if (!token || !/^\d+$/.test(String(afiliado ?? ''))) return null;
  const ahora = ctx.ahora.getTime();
  const guardados = ctx.cache?.obtener(CLAVE_CACHE, CADUCIDAD_MS, ahora);
  if (guardados) return guardados;
  try {
    const respuesta = await ctx.http.json(`https://api.awin.com/publishers/${afiliado}/programmes?relationship=joined`, {
      cabeceras: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, reintentos: 1,
    });
    const programas = programasDeRespuesta(respuesta);
    ctx.cache?.guardar(CLAVE_CACHE, programas, ahora);
    return programas;
  } catch (error) {
    // Solo el estado HTTP: el mensaje podría arrastrar cabeceras.
    ctx.log(`Awin no responde (${error.estado ?? error.name ?? 'error'}): la afiliación queda como en la configuración`);
    return ctx.cache?.obtener(CLAVE_CACHE) ?? null;
  }
}

/**
 * La configuración de afiliación con los programas aceptados de Awin activados. Lo escrito a
 * mano manda: un proveedor con «parametros» o «envoltura» propios no se toca.
 */
export function conProgramasAwin(config, programas, log = () => {}) {
  if (!programas?.length) return config;
  const proveedores = { ...(config.proveedores ?? {}) };
  const deDominio = (dominio) => Object.entries(proveedores)
    .find(([, p]) => (p.dominios ?? []).some((d) => d === dominio || dominio.endsWith(`.${d}`) || d.endsWith(`.${dominio}`)));
  const activados = [];
  for (const programa of programas) {
    const encontrado = programa.dominios.map(deDominio).find(Boolean);
    const [id, actual] = encontrado ?? [`awin-${programa.id}`, { dominios: programa.dominios }];
    const manual = Object.keys(actual.parametros ?? {}).length || (typeof actual.envoltura === 'string' && actual.envoltura.trim());
    if (manual) continue;
    proveedores[id] = { ...actual, activo: true, aprobado: true, awinmid: programa.id, envoltura: '' };
    activados.push(`${programa.nombre} (${id})`);
  }
  if (activados.length) log(`Awin: ${activados.length} programas aceptados activados: ${activados.join(', ')}`);
  return { ...config, proveedores };
}
