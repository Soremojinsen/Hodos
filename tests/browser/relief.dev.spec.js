import { expect, test } from "@playwright/test";

// Today's relief noise, as world_default.frag had it: the reference the shared one must match
const REFERENCE = `
vec3 mod289r(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289r(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permuter(vec3 x) { return mod289r(((x * 34.0) + 10.0) * x); }
float snoiser(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289r(i);
    vec3 p = permuter(permuter(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}
float reference(vec2 point) {
    return snoiser(point / 500.0) / 10.0 + snoiser(point / 100.0) / 20.0 + snoiser(point / 50.0) / 40.0;
}
`;

test("the relief noise is today's, and its gradient is its slope", async ({ page }) => {
  await page.goto("./");
  const counts = await page.evaluate(async (reference) => {
    const { default: relief } = await import("/src/map/shaders/relief.glsl?raw");
    const { ShaderProgram } = await import("/src/map/shader.js");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const gl = canvas.getContext("webgl");
    const vertex = `
      attribute vec2 coordinates;
      varying vec2 point;
      void main(void) {
          point = coordinates;
          gl_Position = vec4(coordinates, 0.0, 1.0);
      }`;
    // Red: same value; green: gradient within 2 % (+ a small floor) of finite differences;
    // blue: steep enough for the gradient check to mean something
    const fragment = `${relief}${reference}
      varying vec2 point;
      void main(void) {
          vec2 world = 2345.0 + 1500.0 * (point + 1.0);
          vec3 noise = elevationNoise(world);
          float h = 0.5;
          vec2 slope = vec2(
              reference(world + vec2(h, 0.0)) - reference(world - vec2(h, 0.0)),
              reference(world + vec2(0.0, h)) - reference(world - vec2(0.0, h))) / (2.0 * h);
          float sameValue = step(abs(noise.z - reference(world)), 1e-4);
          float sameSlope = step(length(noise.xy - slope), 2e-5 + 0.02 * length(slope));
          float steep = step(1e-4, length(slope));
          gl_FragColor = vec4(sameValue, sameSlope, steep, 1.0);
      }`;
    const program = new ShaderProgram(gl, "relief_test", vertex, fragment);
    program.compile();
    program.use();
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 64, 64);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const pixels = new Uint8Array(64 * 64 * 4);
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const counts = { total: 64 * 64, sameValue: 0, sameSlope: 0, steep: 0 };
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 255) counts.sameValue++;
      if (pixels[i + 1] === 255) counts.sameSlope++;
      if (pixels[i + 2] === 255) counts.steep++;
    }
    return counts;
  }, REFERENCE);
  expect(counts.sameValue).toBe(counts.total);
  expect(counts.sameSlope).toBe(counts.total);
  expect(counts.steep).toBeGreaterThan(counts.total / 2);
});
