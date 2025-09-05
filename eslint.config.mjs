import { fileURLToPath, URL } from "node:url";

import { includeIgnoreFile } from "@eslint/compat";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default tseslint.config(
	includeIgnoreFile(fileURLToPath(new URL(".gitignore", import.meta.url))),
	{
		extends: [tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Covered by biome.
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",
			// Covered by @typescript-eslint/no-floating-promises.
			"@typescript-eslint/require-await": "warn",
			// Customize @typescript-eslint/no-floating-promises.
			"@typescript-eslint/no-floating-promises": [
				"warn",
				{ checkThenables: true },
			],
		},
	},
	{
		extends: [
			importPlugin.flatConfigs.recommended,
			importPlugin.flatConfigs.typescript,
		],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
		},
		rules: {
			"import/extensions": ["error", "ignorePackages"],
			"import/enforce-node-protocol-usage": ["error", "always"],
			"import/newline-after-import": ["error", { considerComments: true }],
			"import/consistent-type-specifier-style": ["error", "prefer-top-level"],
			"import/exports-last": "off",
			"import/first": "error",
			"import/no-absolute-path": "error",
			"import/no-amd": "error",
			"import/no-commonjs": "error",
			"import/no-cycle": "error",
			"import/no-deprecated": "error",
			"import/no-dynamic-require": "error",
			"import/no-empty-named-blocks": "error",
			"import/no-extraneous-dependencies": "error",
			"import/no-mutable-exports": "error",
			"import/no-relative-packages": "error",
			"import/no-relative-parent-imports": "off",
			"import/no-self-import": "error",
			"import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
			"import/no-unused-modules": "warn",
			"import/no-unresolved": [
				"off", // fs-extra/esm fails to import types in compliance with this rule - app works but eslint doesn't understand what is going on
				{ ignore: ["^vscode$", "^typescript-eslint$"] },
			],
			"import/no-useless-path-segments": "error",
			"import/no-webpack-loader-syntax": "error",
			"import/order": [
				"error",
				{
					groups: [
						"builtin",
						"external",
						"internal",
						"parent",
						"sibling",
						"index",
					],
					alphabetize: {
						order: "asc",
						caseInsensitive: true,
					},
					"newlines-between": "always",
					warnOnUnassignedImports: true,
				},
			],
		},
	},
);
