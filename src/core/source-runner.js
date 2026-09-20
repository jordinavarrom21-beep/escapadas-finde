/**
 * Cola de ejecución de las fuentes: como mucho `maxParalelo` a la vez y nunca dos
 * de la misma web al mismo tiempo (cada fuente ya espacia sus propias peticiones,
 * pero dos fuentes del mismo dominio sí se pisarían entre sí).
 */

/** Fuentes en paralelo si `ajustes.maxFuentesEnParalelo` no dice otra cosa. */
export const MAX_PARALELO_POR_DEFECTO = 4;

/**
 * Dominio que consulta una fuente, o `null` si no consulta ninguna web (modo
 * «buzon», que lee un correo propio por IMAP). Se deduce de `urls[0]` o de `web`.
 */
export function dominioDe(fuente) {
  if (fuente.modo === 'buzon') return null;
  const referencia = fuente.urls?.[0] ?? fuente.web;
  try {
    return new URL(referencia).hostname;
  } catch {
    return null;
  }
}

function limiteValido(maxParalelo) {
  const n = Math.trunc(Number(maxParalelo));
  return Number.isFinite(n) && n > 0 ? n : MAX_PARALELO_POR_DEFECTO;
}

/** Ejecuta una fuente sin dejar que su error tumbe a las demás. */
async function ejecutarUna(fuente, ejecutar) {
  try {
    return { fuente, valor: await ejecutar(fuente), error: null };
  } catch (error) {
    return { fuente, valor: null, error };
  }
}

/**
 * Ejecuta `ejecutar(fuente)` sobre todas las fuentes respetando los dos límites.
 * @param {Array<{modo?: string, urls?: string[], web?: string}>} fuentes
 * @param {{ejecutar: (fuente) => unknown, maxParalelo?: number}} opciones
 * @returns {Promise<Array<{fuente, valor, error}>>} en el mismo orden que `fuentes`
 */
export async function ejecutarFuentes(fuentes, { ejecutar, maxParalelo } = {}) {
  const limite = limiteValido(maxParalelo);
  const pendientes = fuentes.map((fuente, indice) => ({ fuente, indice, dominio: dominioDe(fuente) }));
  const resultados = new Array(fuentes.length);
  const dominiosOcupados = new Set();
  const enCurso = new Set();

  while (pendientes.length || enCurso.size) {
    const siguiente = enCurso.size < limite
      ? pendientes.findIndex(({ dominio }) => !dominio || !dominiosOcupados.has(dominio))
      : -1;
    if (siguiente < 0) {
      // Todo lo que queda está ocupado (por el límite o por su dominio): esperar a que algo acabe.
      await Promise.race(enCurso);
      continue;
    }
    const [tarea] = pendientes.splice(siguiente, 1);
    if (tarea.dominio) dominiosOcupados.add(tarea.dominio);
    const tirada = ejecutarUna(tarea.fuente, ejecutar).then((resultado) => {
      resultados[tarea.indice] = resultado;
      if (tarea.dominio) dominiosOcupados.delete(tarea.dominio);
      enCurso.delete(tirada);
    });
    enCurso.add(tirada);
  }
  return resultados;
}
