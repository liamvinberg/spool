#version 300 es
// How much ink each place on the page should carry, before it is screened.
// The pigment is the shipped bloom's fbm family; where it sits is set by the
// page: a mass beside the headline, a smaller wash mid-page, and a bleed that
// thickens into the solid band. Body copy is kept clear. Coordinates are the
// document's, in CSS pixels, so the print scrolls with the page.
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_size;
uniform float u_top;
uniform float u_time;
uniform vec4 u_hero;
uniform vec4 u_mid;
uniform vec4 u_band;
uniform vec4 u_quiet[8];

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
float boxDistance(vec2 p, vec4 box) {
	vec2 d = abs(p - box.xy - box.zw * .5) - box.zw * .5;
	return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

void main() {
	vec2 px = vec2(v_uv.x * u_size.x, u_top + (1. - v_uv.y) * u_size.y);
	float w = u_size.x;
	float narrow = smoothstep(500., 1100., w);
	float scale = clamp(w * .42, 260., 640.);
	float t = u_time * .035;
	float value = pigment((px - vec2(w * .7, 260.)) / scale, t);
	float cloud = smoothstep(.27, .74, value);

	vec2 heroCenter = vec2(u_hero.x + u_hero.z * mix(.62, .84, narrow), u_hero.y + u_hero.w * mix(.3, .5, narrow));
	float hero = pool(px, heroCenter, vec2(scale * mix(.9, .9, narrow), max(u_hero.w * .5, scale * .52)));
	float mid = pool(px, u_mid.xy + u_mid.zw * .5, max(u_mid.zw, vec2(1.)) * .62);
	float tone = cloud * max(hero * 1.12, mid * .78);

	// Ink thickens toward the band until the dots close into a solid.
	float outside = max(boxDistance(px, u_band), 0.);
	float bleed = 1. - smoothstep(0., 300. * (.4 + value * .9), outside);
	tone = max(tone, bleed * bleed * (.75 + .25 * cloud));
	tone = max(tone, 1. - smoothstep(0., 40., outside));

	float quiet = 0.;
	for (int i = 0; i < 8; i++) {
		float d = boxDistance(px, u_quiet[i]);
		quiet = max(quiet, 1. - smoothstep(-2., 70., d));
	}
	tone *= 1. - quiet * .92;
	outColor = vec4(clamp(tone, 0., 1.), value, 0., 1.);
}
