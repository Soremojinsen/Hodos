varying vec4 position;
varying float b_id;

// Hodos rendering routine
void main(void) {
    float altitude = position.z;
    altitude += step(-0.05, altitude) * elevationNoise(position.xy).z;
    vec4 lowColor = biomeTexel(b_id, 0.0);
    vec4 highColor = biomeTexel(b_id, 1.0);
    vec4 color = mix(lowColor, highColor, altitude);
    gl_FragColor = color;
}