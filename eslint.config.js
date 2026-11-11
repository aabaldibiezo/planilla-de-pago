const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');

/**
 * Configuración compartida por el backend (CommonJS/Node) y el frontend
 * (navegador, scripts globales sin bundler).
 *
 * La regla `max-statements-per-line` es deliberada: es la que impide que vuelva
 * a aparecer el código comprimido a una sola línea que tenía el proyecto.
 */
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      'frontend/dist/**',
      // Librerías de terceros autoalojadas: no se editan ni se les aplica
      // nuestro estilo.
      'frontend/public/vendor/**',
      'backend/receipts/**',
      'backend/uploads/**',
      'backend/prisma/migrations/**',
    ],
  },

  js.configs.recommended,
  prettier,

  // --------------- Backend (Node, CommonJS) ---------------
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'max-statements-per-line': ['error', { max: 1 }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },

  // --------------- Frontend (navegador, scripts globales) ---------------
  {
    files: ['frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Lectura del archivo elegido al adjuntar el recibo firmado.
        FileReader: 'readonly',
        Event: 'readonly',
        Intl: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        clearTimeout: 'readonly',
        // Leaflet, cargado como script global desde `vendor/`.
        L: 'readonly',
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'max-statements-per-line': ['error', { max: 1 }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
];
