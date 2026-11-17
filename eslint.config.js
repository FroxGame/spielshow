'use strict';

const globals = require('globals');

module.exports = [
    {
        files: ['server.js', 'server/**/*.js', 'tests/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none' }]
        }
    }
];