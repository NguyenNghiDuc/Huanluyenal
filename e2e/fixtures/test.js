import { test as base, expect } from "@playwright/test";
export const test = base.extend({
  freshServer: [
    async ({ request }, use) => {
      const result = await request.post("/api/__test/reset");
      expect(result.ok()).toBe(true);
      await use();
    },
    { auto: true },
  ],
});
export { expect };
