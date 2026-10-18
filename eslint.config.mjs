import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // MiLey uses effects to synchronize external session/API state into forms and views.
  // Keep the remaining React Hooks checks, but allow that intentional data-loading pattern.
  { rules: { "react-hooks/set-state-in-effect": "off" } },
  globalIgnores([".next/**", ".arena/**", "playwright-report/**", "test-results/**", "tests/fixtures/**", "out/**", "build/**", "next-env.d.ts"]),
]);
