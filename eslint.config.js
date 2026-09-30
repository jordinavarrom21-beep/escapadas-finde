// ESLint: errores reales (variables sin usar o sin declarar, código inalcanzable…), no estilo.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'site/data/', 'site/escapadas/', 'site/vuelos/', 'site/actividades/', 'dist/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['site/**/*.js'],
    languageOptions: { globals: { ...globals.browser, L: 'readonly', Chart: 'readonly' } },
  },
  {
    files: ['site/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['pruebas-navegador/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
