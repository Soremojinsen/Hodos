varying vec4 position;
varying float b_id;
varying vec2 land_slope;

// Hodos rendering routine
void main(void) {
    float altitude = position.z;
    vec3 relief = elevationNoise(position.xy);
    float land = step(-0.05, altitude);
    altitude += land * relief.z;
    vec4 lowColor = biomeTexel(b_id, 0.0);
    vec4 highColor = biomeTexel(b_id, 1.0);
    vec4 color = mix(lowColor, highColor, altitude);
    // Water, lakes and rivers stay flat
    if (altitude >= 0.0) {
        color.rgb = hillShade(color.rgb, land_slope, land * relief.xy);
        color.rgb = drawMarks(color.rgb, b_id, position.xy, altitude);
    }
    gl_FragColor = color;
}
