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

// In world units: the side of a mark's grid square at the level of the tile drawn, and a pixel
// of the view, see shader.js setLevel and setView
uniform float mark_cell;
uniform float pixel_world;

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

// Hill shading: a light from the north-west (world y grows northwards), about 40° above the
// horizon; the land's slopes are exaggerated RELIEF times, and the relief noise's count for
// NOISE_SLOPE of theirs, so the ground has texture without looking gravelly
const vec3 LIGHT = vec3(-0.5391638, 0.5391638, 0.6469966); // normalize(-1, 1, 1.2)
const float RELIEF = 250.0;
const float NOISE_SLOPE = 1.0 / 3.0;
const float SHADE_MIN = 0.45;
const float SHADE_MAX = 1.4;
const float SHADE_STRENGTH = 0.55;

// A land color lit from the north-west: flat ground keeps its color
vec3 hillShade(vec3 color, vec2 slope, vec2 noiseSlope) {
    vec3 normal = normalize(vec3(-(slope + NOISE_SLOPE * noiseSlope) * RELIEF, 1.0));
    float lit = dot(normal, LIGHT) / LIGHT.z;
    return color * mix(1.0, clamp(lit, SHADE_MIN, SHADE_MAX), SHADE_STRENGTH);
}

// Vegetation marks, one per square of a grid mark_cell wide anchored in the world, drawn only
// where the pixel's own biome has a mark, and only above the beach and below the mountains
const float MARK_BEACH = 0.1;
const float MARK_MOUNTAIN = 0.65;
// Where a mark's shadow falls, in grid squares: to the south-east, away from the light
const vec2 MARK_SHADOW = vec2(0.06, -0.08);

// A random number in [0, 1) for a grid square ("Hash without Sine", Dave Hoskins, MIT): no
// sin, whose precision on large arguments varies between GPUs
float markHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// How much of a pixel a shape covers, from its signed distance (negative inside) and the
// pixel's size, both in grid squares
float cover(float distance, float pixel) {
    return clamp(0.5 - distance / pixel, 0.0, 1.0);
}

// Roughly the signed distance to a small conifer: a triangle pointing north
float conifer(vec2 q) {
    float halfWidth = 0.16 * (0.26 - q.y) / 0.48;
    return max(max(abs(q.x) - halfWidth, -0.22 - q.y), q.y - 0.26);
}

// Roughly the signed distance to a tuft of three reeds leaning apart, the middle one tallest
float reeds(vec2 q) {
    float distance = 1.0;
    for (int i = -1; i <= 1; i++) {
        float k = float(i);
        float x = q.x - 0.09 * k - 0.25 * k * (q.y + 0.12);
        float top = 0.14 - 0.05 * abs(k);
        distance = min(distance, max(abs(x) - 0.04, max(-0.12 - q.y, q.y - top)));
    }
    return distance;
}

// A color with the mark of its biome drawn over it, at a world point and altitude
vec3 drawMarks(vec3 color, float id, vec2 point, float altitude) {
    float kind = floor(biomeTexel(id, 2.0).r * 255.0 + 0.5);
    if (kind < 0.5 || altitude < MARK_BEACH || altitude >= MARK_MOUNTAIN) return color;
    vec2 square = floor(point / mark_cell);
    float pixel = pixel_world / mark_cell;
    // The mark's centre stays 0.3 from the square's sides, so no mark crosses into the next
    vec2 q = point / mark_cell - square - (0.3 + 0.4 * vec2(markHash(square), markHash(square + 17.0)));
    float keep = markHash(square + 41.0);
    float mark = 0.0;
    float shadow = 0.0;
    float dark = 0.55;
    if (kind < 1.5) {
        // Broadleaf: round crowns, a few squares left bare
        if (keep > 0.85) return color;
        mark = cover(length(q) - 0.2, pixel);
        shadow = cover(length(q - MARK_SHADOW) - 0.22, pixel);
    } else if (kind < 2.5) {
        // Jungle: larger, darker crowns in every square
        mark = cover(length(q) - 0.26, pixel);
        shadow = cover(length(q - MARK_SHADOW) - 0.28, pixel);
        dark = 0.42;
    } else if (kind < 3.5) {
        mark = cover(conifer(q), pixel);
        shadow = cover(conifer(q - MARK_SHADOW), pixel);
        dark = 0.5;
    } else {
        // Reeds, sparse
        if (keep > 0.6) return color;
        mark = cover(reeds(q), pixel);
        dark = 0.6;
    }
    color = mix(color, color * 0.75, shadow * (1.0 - mark));
    return mix(color, color * dark, mark);
}
