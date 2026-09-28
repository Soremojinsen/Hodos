// Shared by the Parchemin and Biomes fragment shaders, which renderer.js puts after this file:
// the biome texture, the relief noise with its gradient, hill shading and vegetation marks.

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

// Low color, high color and mark kind of each biome, 3 texels per biome id, see renderer.js
// #loadBiomeColors
uniform sampler2D biomes;
uniform float max_id;

// Texel k of a biome: 0 its low color, 1 its high color, 2 its mark kind (in red, kind / 255)
vec4 biomeTexel(float id, float k) {
    return texture2D(biomes, vec2((3.0 * id + k + 0.5) / (3.0 * max_id + 3.0), 0.5));
}

//
// Description : Array and textureless GLSL 2D simplex noise function.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//
// Changed for Hodos: it also returns its gradient.

vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x*34.0)+10.0)*x);
}

// The simplex noise at v (z) and its gradient (xy)
vec3 snoiseGrad(vec2 v) {
    const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
    0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
    -0.577350269189626,  // -1.0 + 2.0 * C.x
    0.024390243902439); // 1.0 / 41.0
    // First corner
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    // Other corners
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    // Permutations
    i = mod289(i); // Avoid truncation effects in permutation
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    // Gradients: 41 points uniformly over a line, mapped onto a diamond.
    // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    // Each corner adds norm * t^4 * dot(gradient, offset), with t = max(0.5 - |offset|², 0);
    // its derivative is norm * (t^4 * gradient - 8 t^3 * dot(gradient, offset) * offset)
    vec3 t = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    vec3 norm = 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 t2 = t * t;
    vec3 w = norm * t2 * t2;
    vec2 g0 = vec2(a0.x, h.x);
    vec2 g1 = vec2(a0.y, h.y);
    vec2 g2 = vec2(a0.z, h.z);
    vec3 dots = vec3(dot(g0, x0), dot(g1, x12.xy), dot(g2, x12.zw));
    vec3 dw = -8.0 * norm * t2 * t * dots;
    vec2 gradient = w.x * g0 + w.y * g1 + w.z * g2 + dw.x * x0 + dw.y * x12.xy + dw.z * x12.zw;
    return 130.0 * vec3(gradient, dot(w, dots));
}

// The relief noise the shaders add to the land's altitude (z), and its gradient per world unit (xy)
vec3 elevationNoise(vec2 point) {
    vec3 octave1 = snoiseGrad(point / 500.0) * vec3(1.0 / 500.0, 1.0 / 500.0, 1.0) / 10.0;
    vec3 octave2 = snoiseGrad(point / 100.0) * vec3(1.0 / 100.0, 1.0 / 100.0, 1.0) / 20.0;
    vec3 octave3 = snoiseGrad(point / 50.0) * vec3(1.0 / 50.0, 1.0 / 50.0, 1.0) / 40.0;
    return octave1 + octave2 + octave3;
}
