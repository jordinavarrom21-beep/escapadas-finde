/**
 * Resumen de una frase de lo que incluye de verdad cada oferta, escrito por Claude a partir
 * del texto de la propia web (sin inventar nada). OPCIONAL y de pago: solo funciona con el
 * secreto ANTHROPIC_API_KEY; sin él no hace nada.
 *
 * Coste acotado: cada resumen se guarda (se repite solo si cambia el texto de la oferta),
 * como mucho `resumenes.maxPorEscaneo` nuevos por escaneo y en lotes de `LOTE` ofertas por
 * petición. Modelo y límite en config/ajustes.json («resumenes»).
 */
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';

const MODELO = 'claude-opus-5-5';
const LOTE = 20;
const MAX_POR_ESCANEO = 40;
const CADUCIDAD_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_TEXTO = 900;

export const INSTRUCCIONES = `Eres el redactor de una web de escapadas de fin de semana. Para cada oferta recibes su título, el texto que publica la web y el precio.
Escribe para cada una UNA frase en español (como mucho 140 caracteres) que diga qué incluye de verdad: tipo de alojamiento, noches, régimen de comidas y extras concretos (spa, actividad, entradas…).
Reglas:
- Usa solo datos que estén en el texto. Si falta algo, no lo menciones; nunca lo supongas.
- Nada de adjetivos publicitarios («increíble», «único») ni opiniones.
- No repitas el precio ni el nombre de la web.
- Si el texto no dice qué incluye, escribe exactamente: «La web no detalla qué incluye».
Devuelve un resumen por cada id recibido.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    resumenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, resumen: { type: 'string' } },
        required: ['id', 'resumen'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumenes'],
  additionalProperties: false,
};

const huella = (o) => createHash('sha256').update(`${o.titulo}\n${o.descripcion}\n${o.precioTexto ?? ''}`).digest('hex').slice(0, 16);
const clave = (o) => `resumen:${o.id}:${huella(o)}`;

/** Las ofertas que merecen resumen: con un texto que resumir (los vuelos ya dicen lo que son). */
export const resumibles = (ofertas) => ofertas.filter((o) => o.tipo !== 'vuelo' && (o.descripcion?.length ?? 0) >= 60);

/** El mensaje con un lote de ofertas. */
export function mensajeLote(lote) {
  return JSON.stringify(lote.map((o) => ({
    id: o.id, titulo: o.titulo, texto: o.descripcion.slice(0, MAX_TEXTO), precio: o.precioTexto ?? null,
  })));
}

/** Resúmenes de la respuesta, solo de los ids pedidos y con un texto razonable. */
export function leerRespuesta(respuesta, ids) {
  if (respuesta.stop_reason === 'refusal') throw new Error('Claude ha rechazado el lote');
  const texto = respuesta.content.find((b) => b.type === 'text')?.text;
  if (!texto) throw new Error(`Respuesta sin texto (stop_reason: ${respuesta.stop_reason})`);
  const { resumenes } = JSON.parse(texto);
  const pedidos = new Set(ids);
  return new Map(resumenes
    .filter((r) => pedidos.has(r.id) && typeof r.resumen === 'string')
    .map((r) => [r.id, r.resumen.trim().slice(0, 200)])
    .filter(([, r]) => r.length >= 10));
}

/** Pone `resumen` en las ofertas: lo guardado y, si hay clave, lo nuevo (hasta el límite). */
export async function anadirResumenes(ofertas, ctx) {
  const candidatas = resumibles(ofertas);
  const ahora = ctx.ahora.getTime();
  const pendientes = [];
  for (const oferta of candidatas) {
    const guardado = ctx.cache.obtener(clave(oferta), CADUCIDAD_MS, ahora);
    if (guardado) oferta.resumen = guardado;
    else pendientes.push(oferta);
  }
  const apiKey = ctx.env.ANTHROPIC_API_KEY;
  if (!apiKey || !pendientes.length) return;

  const config = ctx.ajustes.resumenes ?? {};
  if (config.activo === false) return;
  const cliente = ctx.claude ?? new Anthropic({ apiKey });
  const modelo = config.modelo ?? MODELO;
  // Las más nuevas primero: son las que más gente va a ver.
  const tanda = pendientes
    .sort((a, b) => String(b.vistaPrimera ?? '').localeCompare(String(a.vistaPrimera ?? '')))
    .slice(0, config.maxPorEscaneo ?? MAX_POR_ESCANEO);
  let hechos = 0;
  for (let i = 0; i < tanda.length; i += LOTE) {
    const lote = tanda.slice(i, i + LOTE);
    try {
      const respuesta = await cliente.beta.messages.create({
        model: modelo,
        max_tokens: 8000,
        system: INSTRUCCIONES,
        messages: [{ role: 'user', content: mensajeLote(lote) }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
        // Si el modelo rechaza el lote por sus filtros, la API lo repite con otro modelo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      const resumenes = leerRespuesta(respuesta, lote.map((o) => o.id));
      for (const oferta of lote) {
        const resumen = resumenes.get(oferta.id);
        if (!resumen) continue;
        oferta.resumen = resumen;
        ctx.cache.guardar(clave(oferta), resumen, ahora);
        hechos += 1;
      }
    } catch (error) {
      ctx.log(`Resúmenes: lote fallido (${error instanceof Anthropic.APIError ? `HTTP ${error.status}` : error.message})`);
      if (error instanceof Anthropic.AuthenticationError) {
        ctx.log('Resúmenes: revisa el secreto ANTHROPIC_API_KEY');
        break;
      }
    }
  }
  ctx.log(`Resúmenes: ${hechos} nuevos (${pendientes.length - hechos} pendientes para los próximos escaneos)`);
}
