#version 300 es
// Pigment that exists only inside the letters. The same fbm family as the
// shipped bloom field, warped by the water in u_state, with ink pooling darker
// along each letter's walls the way watercolour dries at its edge. Before the
// ink arrives the letters read as empty glass; on entry a drop lands at
// u_origin and spreads through them.
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_mask;
uniform sampler2D u_state;
uniform vec2 u_size;
uniform float u_time;
uniform float u_reveal;
uniform vec2 u_origin;
uniform float u_seed;
uniform float u_ratio;

const vec3 RED = vec3(.961, .224, .102);
const vec3 DEEP = vec3(.25, .03, .015);
const vec3 HOT = vec3(1., .5, .34);
const vec3 GLASS = vec3(.105, .1, .098);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3. - 2. * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
}
float fbm(vec2 p) {
	float n = 0., a = .5;
	for (int i = 0; i < 4; i++) { n += a * noise(p); p = rot(.53) * p * 2.03 + 3.7; a *= .5; }
	return n;
}
float pigment(vec2 p, float t) {
	vec2 drift = vec2(fbm(p * 2.1 + vec2(t, 0.)), fbm(p * 2.1 + vec2(4.2, -t))) - .5;
	return fbm(p * 2.6 + drift * 3.2 + vec2(t, t * .4));
}

void main() {
	float mask = texture(u_mask, v_uv).a;
	float soft = texture(u_mask, v_uv, 2.4).a;
	if (mask < .002) { outColor = vec4(0.); return; }

	vec2 px = v_uv * u_size;
	vec4 water = texture(u_state, v_uv);
	float scale = clamp(u_size.y * .62, 200., 460.);
	vec2 p = (px - water.zw) / scale + u_seed;
	float t = u_time * .05;
	float value = pigment(p, t);

	vec3 ink = mix(DEEP, RED, smoothstep(.27, .63, value));
	ink = mix(ink, HOT, smoothstep(.66, .86, value) * .42);
	// Pigment gathers against the walls of each letter.
	float wall = clamp((mask - soft) * 2.4, 0., 1.);
	ink = mix(ink, DEEP * .9, wall * .38);
	// Where the hand has just passed, the water thins the colour a little.
	float wake = clamp(length(water.xy) * .025, 0., .18);
	ink = mix(ink, HOT, wake);
	float grain = hash(floor(px * u_ratio)) - .5;
	ink *= 1. + grain * .07;

	// The drop lands and spreads with an irregular, pigment-shaped front.
	float growth = 1. - pow(1. - u_reveal, 3.);
	float dist = length((px - u_origin) / u_size.x);
	float reach = growth * 1.35 - .05;
	float front = 1. - smoothstep(reach - .05, reach + .03, dist + (value - .5) * .16);
	front = mix(front, 1., smoothstep(.92, 1., u_reveal));
	float density = .8 + .2 * smoothstep(.22, .58, value);

	vec3 color = mix(GLASS, ink, front * density);
	outColor = vec4(color * mask, mask);
}
