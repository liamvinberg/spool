precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;     // css pixels of the table
uniform float u_time;
uniform vec4 u_cards[6]; // centre x, y and velocity x, y of each sheet, css pixels
uniform float u_wide;    // 1 on a wide table, 0 on a phone

const vec3 BG = vec3(.0549);
const vec3 RED = vec3(.961, .224, .102);
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
	vec2 drift = vec2(fbm(p * 2.3 + vec2(t, 0.)), fbm(p * 2.3 + vec2(4.2, -t))) - .5;
	return fbm(p * 3. + drift * 3. + vec2(t, t * .4));
}
float pool(vec2 px, vec2 center, vec2 radius) {
	vec2 d = (px - center) / radius;
	return exp(-dot(d, d) * 2.);
}

void main() {
	vec2 px = vec2(v_uv.x, 1. - v_uv.y) * u_size;
	// A sheet moving through the pigment drags it along; it settles when the sheet does.
	vec2 push = vec2(0.);
	for (int i = 0; i < 6; i++) {
		vec4 card = u_cards[i];
		vec2 d = px - card.xy;
		float reach = 230.;
		float w = exp(-dot(d, d) / (reach * reach));
		push += card.zw * w;
	}
	px -= push * .14;
	float scale = clamp(u_size.x * .4, 300., 640.);
	vec2 anchor = mix(vec2(u_size.x * .5, u_size.y * .42), vec2(u_size.x * .74, u_size.y * .44), u_wide);
	vec2 p = (px - anchor) / scale;
	float t = u_time * .045;
	float value = pigment(p, t);
	float cloud = smoothstep(.31, .76, value);
	float main = pool(px, anchor, mix(vec2(scale * 1.1, u_size.y * .3), vec2(scale * .95, u_size.y * .52), u_wide));
	float low = pool(px, mix(vec2(u_size.x * .3, u_size.y * .82), vec2(u_size.x * .18, u_size.y * .98), u_wide), vec2(scale * .8, 260.));
	float amount = cloud * max(main, low * .55);
	float grain = hash(floor(px));
	vec3 ink = mix(vec3(.3, .035, .015), RED, smoothstep(.34, .7, value));
	float opacity = clamp(amount * (.72 + grain * .36), 0., 1.) * .94;
	gl_FragColor = vec4(mix(BG, ink, opacity), 1.);
}
