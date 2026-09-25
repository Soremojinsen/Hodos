import { expect, test } from "@playwright/test";

test("a broken shader is reported with its compile log", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("./");
  const threw = await page.evaluate(async () => {
    const { FragmentShader } = await import("/src/map/shader.js");
    const gl = document.createElement("canvas").getContext("webgl");
    try {
      new FragmentShader(gl, "broken.frag", "this is not glsl").compile();
      return false;
    } catch {
      return true;
    }
  });
  expect(threw).toBe(true);
  expect(errors.some((e) => e.includes("Failed to compile shader broken.frag:"))).toBe(true);
});
