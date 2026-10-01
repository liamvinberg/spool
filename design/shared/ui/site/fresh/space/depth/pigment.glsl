#version 300 es
precision highp float;
// The landing's pigment, made to tile: the same warped fbm, on a lattice that
// wraps every PERIOD cells, rendered into a small texture once a frame. The
// volume samples it on every fog sheet, so the costly part runs at 512 squared
// instead of once per screen pixel per sheet.
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;

const float PERIOD = 4.;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p, float period) {
 vec2 i = floor(p), f = fract(p);
 f = f*f*(3.-2.*f);
 vec2 a = mod(i, period), b = mod(i + 1., period);
 return mix(mix(hash(a), hash(vec2(b.x, a.y)), f.x), mix(hash(vec2(a.x, b.y)), hash(b), f.x), f.y);
}
float fbm(vec2 p) {
 float n = 0., a = .5, period = PERIOD;
 for (int i = 0; i < 4; i++) { n += a*noise(p, period); p = p*2. + 3.; period *= 2.; a *= .5; }
 return n;
}
void main() {
 vec2 p = v_uv*PERIOD;
 float t = u_time*.05*PERIOD;
 // Integer shifts keep the tile seamless; the drift itself is periodic.
 vec2 drift = vec2(fbm(p + vec2(t, 0.)), fbm(p + vec2(1., -t))) - .5;
 float value = fbm(p + drift*3. + vec2(t, t*.4));
 outColor = vec4(value, drift + .5, 1.);
}
