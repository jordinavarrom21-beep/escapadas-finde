/**
 * Carga diferida de librerías desde cdnjs, con integridad (SRI) y una sola vez.
 */

const CDNJS = 'https://cdnjs.cloudflare.com/ajax/libs';

export const LEAFLET = {
  css: {
    url: `${CDNJS}/leaflet/1.9.4/leaflet.min.css`,
    integridad: 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==',
  },
  js: {
    url: `${CDNJS}/leaflet/1.9.4/leaflet.min.js`,
    integridad: 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==',
  },
};

export const CHART = {
  url: `${CDNJS}/Chart.js/4.5.1/chart.umd.min.js`,
  integridad: 'sha512-WoViKhKD4qI2WruSZqv9+kvM4WfFhUMQCLN4QlDTt5aU56fLQy2gYoxWIqlEnXqJy/+Ac5q/hk1oWfqnMDhwMA==',
};

const cargas = new Map();

function cargar(etiqueta, atributos) {
  const clave = atributos.src ?? atributos.href;
  if (!cargas.has(clave)) {
    cargas.set(clave, new Promise((resolver, rechazar) => {
      const elemento = Object.assign(document.createElement(etiqueta), atributos, { crossOrigin: 'anonymous', referrerPolicy: 'no-referrer' });
      elemento.addEventListener('load', resolver, { once: true });
      elemento.addEventListener('error', () => {
        cargas.delete(clave);
        elemento.remove();
        rechazar(new Error(`No se ha podido cargar ${clave}`));
      }, { once: true });
      document.head.append(elemento);
    }));
  }
  return cargas.get(clave);
}

export const cargarScript = ({ url, integridad }) => cargar('script', { src: url, integrity: integridad });
export const cargarEstilo = ({ url, integridad }) => cargar('link', { rel: 'stylesheet', href: url, integrity: integridad });
