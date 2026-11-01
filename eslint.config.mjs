import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // `.perf` holds the measurement harness: its esbuild output is generated
  // third-party code, not app source, so it is not linted.
  globalIgnores([".next/**", ".perf/**", ".arena/**", "playwright-report/**", "test-results/**", "tests/fixtures/**", "out/**", "build/**", "next-env.d.ts"]),
]);
