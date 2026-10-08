import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

import planbox from "./eslint-rules.js";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "src/core/api/schema.d.ts"]),
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts", "playwright.config.ts", "e2e/**/*.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
      jsdoc.configs["flat/recommended-typescript-error"],
    ],
    plugins: { planbox },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "planbox/boundaries": "error",
      "planbox/one-component-per-file": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
      // Conflicts with no-non-null-assertion (strict); we prefer explicit `as` after a length check.
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
      // JSDoc on every export, kept short: say what it does, don't restate the types.
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
            ClassDeclaration: true,
          },
          contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration"],
        },
      ],
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-yields": "off",
      "jsdoc/tag-lines": "off",
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**", "e2e/**"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
]);
