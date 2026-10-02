// Shared by the Parchemin and Biomes fragment shaders, which renderer.js puts after this file:
// the biome texture, the relief noise with its gradient, hill shading and vegetation marks.

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

// Low color, high color, and Parchemin tint of each biome, 3 texels per biome id, see renderer.js
// #loadBiomeColors
uniform sampler2D biomes;
uniform float max_id;

// In world units: the side of a mark's grid square at the level of the tile drawn, and a device
// pixel of the view, see shader.js setLevel and setView
uniform float mark_cell;
uniform float pixel_world;
// The trees of the tile drawn, a texel per square of a grid mark_cell wide anchored in the world,
// from the square at column and row mark_origin, mark_size of them, see generation/trees.js
// treeGrid: the tree's kind in red (0 for none, else its index in MARKS + 1), a random byte for
// its size and shade in green, and its centre in the square in blue and alpha
uniform sampler2D mark_trees;
uniform vec2 mark_origin;
uniform vec2 mark_size;

// Texel k of a biome: 0 its low color, 1 its high color, 2 its Parchemin tint (in green)
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
const float SHADE_MIN = 0.55;
const float SHADE_MAX = 1.3;
const float SHADE_STRENGTH = 0.55;

// A land color lit from the north-west: flat ground keeps its color
vec3 hillShade(vec3 color, vec2 slope, vec2 noiseSlope) {
    vec3 normal = normalize(vec3(-(slope + NOISE_SLOPE * noiseSlope) * RELIEF, 1.0));
    float lit = dot(normal, LIGHT) / LIGHT.z;
    return color * mix(1.0, clamp(lit, SHADE_MIN, SHADE_MAX), SHADE_STRENGTH);
}

// Where a tree's shadow falls, in grid squares: to the south-east, away from the light
const vec2 MARK_SHADOW = vec2(0.06, -0.08);

// How much of a pixel a shape covers, from its signed distance (negative inside) and the
// pixel's size, both in grid squares
float cover(float d, float pixel) {
    return clamp(0.5 - d / pixel, 0.0, 1.0);
}

// Roughly the signed distance to a small conifer: a triangle pointing north
float conifer(vec2 q) {
    float halfWidth = 0.16 * (0.26 - q.y) / 0.48;
    return max(max(abs(q.x) - halfWidth, -0.22 - q.y), q.y - 0.26);
}

// Roughly the signed distance to a tuft of three reeds leaning apart, the middle one tallest
float reeds(vec2 q) {
    float d = 1.0;
    for (int i = -1; i <= 1; i++) {
        float k = float(i);
        float x = q.x - 0.09 * k - 0.25 * k * (q.y + 0.12);
        float top = 0.14 - 0.05 * abs(k);
        d = min(d, max(abs(x) - 0.04, max(-0.12 - q.y, q.y - top)));
    }
    return d;
}

// A land color with its trees drawn over it, at a world point: the trees of the pixel's square
// and the 8 around, as a tree reaches less than a square from its centre (trees.js TREE_REACH).
// Northern trees are drawn first, so a southern crown covers them
vec3 drawMarks(vec3 color, vec2 point) {
    vec2 here = floor(point / mark_cell);
    float pixel = pixel_world / mark_cell;
    // A bound on how far a tree and its shadow reach from its centre, in grid squares. The
    // farthest is a conifer's shadow corner, at 0.372 times the tree's scale (at most 1.18, so
    // 0.439), plus 1.6 times the half pixel its edges are antialiased over (see cover): about 0.53
    // squares at the farthest zoom a level is drawn. 0.45 plus a whole pixel bounds it at any zoom
    float reach = 0.45 + pixel;
    float reachSquared = reach * reach;
    vec2 at = point / mark_cell;
    vec3 base = color;
    for (int dy = 1; dy >= -1; dy--) {
        for (int dx = -1; dx <= 1; dx++) {
            vec2 square = here + vec2(float(dx), float(dy));
            vec2 texel = square - mark_origin;
            if (any(lessThan(texel, vec2(0.0))) || any(greaterThanEqual(texel, mark_size))) continue;
            vec4 tree = texture2D(mark_trees, (texel + 0.5) / mark_size);
            float kind = floor(tree.r * 255.0 + 0.5);
            if (kind < 0.5) continue;
            vec2 centre = square + (floor(tree.ba * 255.0 + 0.5) + 0.5) / 256.0;
            // Most of the 9 trees are out of the pixel's reach: skip them before their shapes
            vec2 offset = at - centre;
            if (dot(offset, offset) > reachSquared) continue;
            float rnd = floor(tree.g * 255.0 + 0.5);
            // 0.75 to 1.18 times its size, so it reaches less than a square (see trees.js
            // TREE_REACH), and up to 8 % darker or lighter, apart
            float scale = 0.75 + 0.43 * rnd / 255.0;
            float shade = 1.0 + 0.16 * (fract(rnd * 0.618034) - 0.5);
            vec2 q = offset / scale;
            float p = pixel / scale;
            float mark;
            float shadow = 0.0;
            float dark;
            if (kind < 1.5) {
                // Broadleaf: a round crown
                mark = cover(length(q) - 0.18, p);
                shadow = cover(length(q - MARK_SHADOW) - 0.2, p);
                dark = 0.55;
            } else if (kind < 2.5) {
                // Jungle: a larger, darker crown
                mark = cover(length(q) - 0.21, p);
                shadow = cover(length(q - MARK_SHADOW) - 0.23, p);
                dark = 0.42;
            } else if (kind < 3.5) {
                mark = cover(conifer(q), p);
                shadow = cover(conifer(q - MARK_SHADOW), p);
                dark = 0.5;
            } else {
                // Reeds, without a shadow
                mark = cover(reeds(q), p);
                dark = 0.6;
            }
            // A shadow only darkens, even over another crown; a crown is drawn over all before
            color = mix(color, min(color, base * 0.75), shadow * (1.0 - mark));
            color = mix(color, base * dark * shade, mark);
        }
    }
    return color;
}
