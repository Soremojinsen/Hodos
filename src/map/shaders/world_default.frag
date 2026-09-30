varying vec4 position;
varying float b_id;
varying vec2 land_slope;

// The green a biome's Parchemin tint (see biomeTexel) blends its lowland towards, and how far a
// tint of 1 goes: floodplains read as a green thread through the parchment
const vec3 PARCHMENT_GREEN = vec3(0.4, 0.55, 0.28);
const float PARCHMENT_TINT = 0.7;

// Hodos rendering routine
void main(void) {
    float altitude = position.z;
    vec3 relief = elevationNoise(position.xy);
    float land = step(-0.05, altitude);
    altitude += land * relief.z;
    float water = 1.0 - step(0.0, altitude);
    float beach = (1.0 - step(0.1, altitude)) * (1.0 - water);
    float plains = (1.0 - step(0.65, altitude)) * (1.0 - water) * (1.0 - beach);
    float mountains = (1.0 - step(0.8, altitude)) * (1.0 - water) * (1.0 - beach) * (1.0 - plains);
    float snow = 1.0 - water - beach - plains - mountains;
    vec4 plainsColor = vec4(0.529 - altitude / 5.0, 0.556 - altitude / 5.0, 0.364 - altitude / 5.0, 1.0);
    vec4 waterColor = vec4(0.278, 0.470, 0.525, 1.0);
    vec4 beachColor = vec4(0.760, 0.709, 0.501, 1.0);
    vec4 mountainsColor = vec4(0.556, 0.498, 0.364, 1.0);
    vec4 snowColor = vec4(0.705, 0.682, 0.635, 1.0);
    vec4 color =
    water * waterColor +
    beach * beachColor +
    plains * plainsColor +
    mountains * mountainsColor +
    snow * snowColor;
    // Water, lakes and rivers stay flat
    if (water < 0.5) {
        float tint = biomeTexel(b_id, 2.0).g;
        color.rgb = mix(color.rgb, PARCHMENT_GREEN, plains * tint * PARCHMENT_TINT);
        color.rgb = hillShade(color.rgb, land_slope, land * relief.xy);
        color.rgb = drawMarks(color.rgb, b_id, position.xy, altitude);
    }
    gl_FragColor = color;
}
