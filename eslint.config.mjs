import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Scene images are already sized JPEGs on Blob; the optimizer would only add latency and cost.
  { rules: { "@next/next/no-img-element": "off" } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
