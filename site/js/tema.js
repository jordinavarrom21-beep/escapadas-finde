/**
 * Aplica el tema claro u oscuro guardado antes de pintar nada, para que no parpadee.
 * Es un script clásico y síncrono en el <head> (no un módulo): los módulos se ejecutan
 * después de pintar. Va en archivo aparte porque la CSP no permite scripts en línea.
 */
try {
  const tema = localStorage.getItem('escapadas:tema');
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  // Lo mismo con «Lista» o «Tarjetas» en los resultados.
  if (localStorage.getItem('escapadas:modoLista') === 'lista') document.documentElement.classList.add('modo-lista');
} catch (error) {
  // Sin acceso a localStorage (bloqueado o modo privado) se usa el tema del sistema.
  console.warn('No se puede leer el tema guardado:', error);
}
