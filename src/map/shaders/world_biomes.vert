precision highp float;

attribute vec3 coordinates;
attribute float biome_id;
// The slope of the land at the vertex, see generation/tiles.js buildTile; (0, 0) for rivers
attribute vec2 slope;

// Where a river vertex goes, see generation/rivers.js buildRivers: a direction to move it by half
// the river's width, and the log2 of its flow. (0, 0, 0) for the cells.
attribute vec3 river_shape;

uniform mat4 view;
// See generation/rivers.js riverWidthUniform: for rivers drawn as lines, log2 of the flow drawn
// 1 px wide at this zoom, the smallest and largest widths in pixels, and the world units per
// pixel; for their real width, the pixels of a river of flow 1, and how the two widths blend
uniform vec4 river_width;
uniform vec2 river_real;

varying vec4 position;
varying float b_id;
varying vec2 land_slope;

void main(void) {
    b_id = biome_id;
    land_slope = slope;
    float line = clamp(
        river_width.y + river_shape.z - river_width.x, river_width.y, river_width.z);
    float real = river_real.x * exp2(0.5 * river_shape.z);
    float pixels = pow(pow(line, river_real.y) + pow(real, river_real.y), 1.0 / river_real.y);
    vec2 offset = river_shape.xy * (0.5 * pixels * river_width.w);
    position = vec4(coordinates.xy + offset, coordinates.z, 1);
    gl_Position = view * position;
}
