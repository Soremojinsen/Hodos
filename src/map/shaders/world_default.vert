precision highp float;

attribute vec3 coordinates;

// Where a river vertex goes, see generation/rivers.js buildRivers: a direction to move it by half
// the river's width, and the log2 of its flow. (0, 0, 0) for the cells.
attribute vec3 river_shape;

uniform mat4 view;
// See generation/rivers.js riverWidthUniform: log2 of the flow drawn 1 px wide at this zoom, the
// smallest and largest widths in pixels, and the world units per pixel
uniform vec4 river_width;

varying vec4 position;

void main(void) {
    float pixels = clamp(
        river_width.y + river_shape.z - river_width.x, river_width.y, river_width.z);
    vec2 offset = river_shape.xy * (0.5 * pixels * river_width.w);
    position = vec4(coordinates.xy + offset, coordinates.z, 1);
    gl_Position = view * position;
}
