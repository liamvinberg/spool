#version 300 es
precision highp float;
// The trail spreads a little, fades a little, and is fed wherever there is food.
// Food is the outline of each frame, a path between them, and the pointer.
// Inside the quiet boxes the trail is soured, so the walkers route round the words.
uniform sampler2D u_trail;
uniform vec2 u_res;
uniform float u_decay;
uniform float u_food;
uniform vec4 u_rects[6];   // trail px: centre x, centre y, half w, half h
uniform float u_rectOn[6];
uniform vec2 u_path[13];
uniform float u_pathOn;
uniform vec3 u_pointer;    // trail px x, y, strength
uniform vec4 u_quiet[2];   // trail px: x0, y0, x1, y1
uniform float u_quietOn;
uniform vec4 u_focus;      // trail px: centre x, centre y, half w, half h
uniform float u_focusOn;
uniform float u_reachPx;   // how far from the focus the ground stays fertile
out vec4 outTrail;

float sdBox(vec2 p, vec4 b) {
	vec2 d = abs(p - b.xy) - b.zw;
	return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a, ba = b - a;
	float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0., 1.);
	return length(pa - ba * h);
}

void main() {
	vec2 px = gl_FragCoord.xy;
	vec2 texel = 1. / u_res;
	vec2 uv = px * texel;
	float centre = texture(u_trail, uv).r;
	float sum = 0.;
	for (int y = -1; y <= 1; y++)
		for (int x = -1; x <= 1; x++) sum += texture(u_trail, uv + vec2(x, y) * texel).r;
	float v = mix(centre, sum / 9., .35) * u_decay;

	// Away from what the page is talking about, trail sours fast and the walkers only wander.
	float away = max(sdBox(px, u_focus), 0.);
	float barren = smoothstep(0., u_reachPx, away) * u_focusOn;
	v *= mix(1., .62, barren);

	float food = 0.;
	for (int i = 0; i < 6; i++) {
		float d = abs(sdBox(px, u_rects[i]));
		food = max(food, (1. - smoothstep(.3, 1.4, d)) * u_rectOn[i]);
	}
	if (u_pathOn > 0.) {
		float d = 1e4;
		for (int i = 0; i < 12; i++) d = min(d, sdSeg(px, u_path[i], u_path[i + 1]));
		food = max(food, (1. - smoothstep(.3, 1.5, d)) * u_pathOn);
	}
	food = max(food, exp(-length(px - u_pointer.xy) / 7.) * u_pointer.z);
	v += food * u_food;

	float quiet = 0.;
	for (int i = 0; i < 2; i++) {
		vec4 q = u_quiet[i];
		vec2 d = max(q.xy - px, px - q.zw);
		quiet = max(quiet, 1. - smoothstep(-6., 10., max(d.x, d.y)));
	}
	v = mix(v, -1.2, quiet * u_quietOn);
	outTrail = vec4(clamp(v, -2., 60.), 0., 0., 1.);
}
