/**
 * Decide qué emails tocan en cada ejecución y lleva la cuenta en `estado.emails`
 * para no repetir avisos: resumen del viernes, chollazos, vigilados y fuentes caídas.
 */
import { esChollazo } from '../enriquecer/puntuacion.js';
import { coincide, vigiladosActivos } from '../vigilados.js';
import { fechaLocal, horaLocal } from '../util/fechas.js';
import { alertaChollazos, alertaFuentes, alertaVigilados, resumenSemanal } from './plantillas.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_RECORDAR_ALERTADOS = 30;
/** Avisos de un mismo vigilado en un día, para que uno muy movido no llene el correo. */
const MAX_AVISOS_POR_VIGILADO_DIA = 1;
/** Una bajada así de gorda salta ese tope: es justo lo que esperas que te cuente. */
const BAJADA_FUERTE_PCT = 15;

function coincidenciasVigiladas(ofertas, vigilados, ultimoAvisado) {
  return vigiladosActivos(vigilados).flatMap((criterio) => ofertas
    .filter((oferta) => oferta.precio != null && coincide(oferta, criterio))
    .map((oferta) => {
      const clave = `${criterio.nombre}|${oferta.id}`;
      return { criterio, oferta, clave, anterior: ultimoAvisado[clave] ?? null };
    }));
}

function limpiarRegistros(emails, ofertas, ahora, hoy) {
  const limite = ahora.getTime() - DIAS_RECORDAR_ALERTADOS * DIA_MS;
  for (const [id, cuando] of Object.entries(emails.alertados)) {
    if (Date.parse(cuando) < limite) delete emails.alertados[id];
  }
  const vivas = new Set(ofertas.map((o) => o.id));
  for (const clave of Object.keys(emails.vigilados)) {
    if (!vivas.has(clave.slice(clave.indexOf('|') + 1))) delete emails.vigilados[clave];
  }
  for (const [nombre, aviso] of Object.entries(emails.avisosVigilado)) {
    if (aviso.fecha !== hoy) delete emails.avisosVigilado[nombre];
  }
}

/**
 * Envía los emails que tocan y actualiza `estado.emails`. Sin `enviar` (faltan
 * secretos) no hace nada ni toca el estado.
 * @returns {Promise<{enviados: string[], errores: string[]}>}
 */
export async function procesarEmails({
  ofertas, estado, ajustes, vigilados = [], findes, puentes, fuentes, panelUrl, ahora = new Date(), enviar, log = console.log,
}) {
  const resultado = { enviados: [], errores: [] };
  if (!enviar) return resultado;
  const emails = estado.emails;
  const config = ajustes.emails;
  const iso = ahora.toISOString();
  const hoy = fechaLocal(ahora);
  if (emails.enviosHoy.fecha !== hoy) emails.enviosHoy = { fecha: hoy, n: 0 };
  // Se crea aquí para que los estados guardados antes de existir el tope sigan valiendo.
  emails.avisosVigilado ??= {};
  limpiarRegistros(emails, ofertas, ahora, hoy);

  const intentar = async (tipo, mensaje, alEnviar) => {
    try {
      await enviar(mensaje);
      alEnviar();
      resultado.enviados.push(tipo);
    } catch (error) {
      resultado.errores.push(`${tipo}: ${error.message}`);
      log(`No se ha podido enviar el email «${tipo}»: ${error.message}`);
    }
  };
  const quedanAlertas = () => emails.enviosHoy.n < config.chollazos.maxPorDia;

  const {
    maxAvisosPorDia = MAX_AVISOS_POR_VIGILADO_DIA,
    bajadaFuertePct = BAJADA_FUERTE_PCT,
  } = config.vigilados;
  const avisosHoy = (nombre) => (emails.avisosVigilado[nombre]?.fecha === hoy ? emails.avisosVigilado[nombre].n : 0);
  const bajadaFuerte = ({ oferta, anterior }) => bajadaFuertePct > 0 && anterior > 0
    && ((anterior - oferta.precio) / anterior) * 100 >= bajadaFuertePct;
  const tocaAvisar = (coincidencia) => avisosHoy(coincidencia.criterio.nombre) < maxAvisosPorDia || bajadaFuerte(coincidencia);
  const anotarAviso = (nombre) => {
    emails.avisosVigilado[nombre] = { fecha: hoy, n: avisosHoy(nombre) + 1 };
  };

  const chollazos = config.chollazos.activo ? ofertas.filter((o) => esChollazo(o, ajustes)) : [];
  const coincidencias = config.vigilados.activo ? coincidenciasVigiladas(ofertas, vigilados, emails.vigilados) : [];

  if (!emails.inicializado) {
    // Primera ejecución con emails: se toma nota de lo que ya existía, sin avisar de ello.
    for (const oferta of chollazos) emails.alertados[oferta.id] = iso;
    for (const { clave, oferta } of coincidencias) emails.vigilados[clave] = oferta.precio;
    emails.inicializado = true;
  } else {
    const bajadas = coincidencias
      .filter(({ oferta, anterior }) => anterior === null || oferta.precio < anterior)
      .filter(tocaAvisar);
    if (bajadas.length && quedanAlertas()) {
      await intentar('vigilados', alertaVigilados({ coincidencias: bajadas, panelUrl }), () => {
        for (const { clave, oferta } of bajadas) emails.vigilados[clave] = oferta.precio;
        for (const nombre of new Set(bajadas.map(({ criterio }) => criterio.nombre))) anotarAviso(nombre);
        emails.enviosHoy.n++;
      });
    }
    const nuevos = chollazos.filter((o) => !emails.alertados[o.id]);
    if (nuevos.length && quedanAlertas()) {
      await intentar('chollazos', alertaChollazos({ ofertas: nuevos, panelUrl }), () => {
        for (const oferta of nuevos) emails.alertados[oferta.id] = iso;
        emails.enviosHoy.n++;
      });
    }
  }

  const { hora, diaSemana } = horaLocal(ahora);
  const { resumen } = config;
  if (resumen.activo && diaSemana === resumen.diaSemana && hora >= resumen.hora && emails.resumenEnviado !== hoy) {
    await intentar('resumen', resumenSemanal({ ofertas, findes, puentes, ajustes, vigilados, panelUrl, ahora }), () => {
      emails.resumenEnviado = hoy;
    });
  }

  const caidas = fuentes.filter((f) =>
    f.estado === 'error' && f.desdeError &&
    ahora - Date.parse(f.desdeError) >= config.fuenteCaidaHoras * 3_600_000 &&
    !(emails.fuentesCaidas[f.id] && ahora - Date.parse(emails.fuentesCaidas[f.id]) < DIA_MS));
  if (caidas.length) {
    await intentar('fuentes', alertaFuentes({ fuentes: caidas, panelUrl, ahora }), () => {
      for (const fuente of caidas) emails.fuentesCaidas[fuente.id] = iso;
    });
  }
  return resultado;
}
