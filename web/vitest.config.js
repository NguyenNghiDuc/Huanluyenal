import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/test/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
