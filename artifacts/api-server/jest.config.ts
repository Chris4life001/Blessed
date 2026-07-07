import type { Config } from "jest";
import path from "path";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Override tsconfig for tests — compile to CJS so jest can handle it
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    // Map workspace packages to their TypeScript source so ts-jest can compile them
    "^@workspace/api-zod$": path.resolve(__dirname, "../../lib/api-zod/src/index.ts"),
    "^@workspace/api-zod/(.*)$": path.resolve(__dirname, "../../lib/api-zod/src/$1"),
    "^@workspace/db/schema$": path.resolve(__dirname, "../../lib/db/src/schema/index.ts"),
    "^@workspace/db/(.*)$": path.resolve(__dirname, "../../lib/db/src/$1"),
  },
  // Don't transform node_modules except workspace packages (they're TypeScript source)
  transformIgnorePatterns: [
    "/node_modules/(?!(@workspace)/)",
  ],
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
  ],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
  // Set env vars for tests — no DATABASE_URL so DB is disabled (in-memory only)
  testEnvironmentOptions: {},
  setupFiles: ["<rootDir>/tests/setup.ts"],
};

export default config;
