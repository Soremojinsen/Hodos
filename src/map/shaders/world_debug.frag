#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D biomes;
uniform float max_id;

varying vec4 position;
varying vec3 dbg_color;
varying float b_id;

void main(void) {
    gl_FragColor = vec4(dbg_color, 1);
}
