# Robotspace App — shared ESLint configuration

const { dirname } = require('path')
const { fileURLToPath } = require('url')

const projectRoot = dirname(__dirname)
const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'build/',
    '**/*.d.ts',
  ],
  rules: {
    // Prevent console.log in production
    'no-console': 'warn',
    // Require error handling in promises
    'prefer-promise/reject-errors': 'error',
  },
}
