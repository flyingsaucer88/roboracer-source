export default [
  {
    files: ["assets/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: { window: "readonly", document: "readonly" },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      "no-unused-vars": "error",
      "no-undef": "error",
      "no-var": "off",
      eqeqeq: ["error", "smart"],
      "prefer-const": "off",
      strict: ["error", "function"],
    },
  },
];
