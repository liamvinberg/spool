#version 300 es
precision highp float;
// Each texel is one walker: x, y in trail pixels, heading, seed. It smells ahead,
// a little left and a little right, turns toward the strongest trail and steps.
uniform sampler2D u_agents;
uniform sampler2D u_trail;
uniform vec2 u_res;
uniform float u_frame;
uniform float u_angle;   // sensor spread, radians
uniform float u_reach;   // sensor distance, trail px
uniform float u_turn;    // turn per step, radians
uniform float u_step;    // step length, trail px
uniform float u_scatter; // chance per step of starting again somewhere new
uniform vec4 u_focus;     // trail px: centre x, centre y, half w, half h
uniform float u_focusOn;
uniform float u_reachPx;
out vec4 outAgent;

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * .1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float smell(vec2 p, float a) {
	vec2 q = p + vec2(cos(a), sin(a)) * u_reach;
	return texture(u_trail, q / u_res).r;
}

void main() {
	vec4 agent = texelFetch(u_agents, ivec2(gl_FragCoord.xy), 0);
	vec2 p = agent.xy;
	float a = agent.z;
	float r = hash(gl_FragCoord.xy + u_frame * vec2(1.37, 7.91) + agent.w);
	float r2 = hash(gl_FragCoord.yx * 1.7 + u_frame * vec2(3.11, .53) - agent.w);

	float f = smell(p, a);
	float l = smell(p, a + u_angle);
	float rt = smell(p, a - u_angle);
	if (f >= l && f >= rt) {
		a += (r - .5) * u_turn * .2;
	} else if (f < l && f < rt) {
		a += (r < .5 ? 1. : -1.) * u_turn;
	} else if (l > rt) {
		a += u_turn * (.6 + .4 * r);
	} else {
		a -= u_turn * (.6 + .4 * r);
	}
	p += vec2(cos(a), sin(a)) * u_step * (.85 + .3 * r2);

	// Walk off the edge and come back in facing the middle.
	if (p.x < 1. || p.y < 1. || p.x > u_res.x - 1. || p.y > u_res.y - 1.) {
		p = clamp(p, vec2(2.), u_res - 2.);
		a = atan(u_res.y * .5 - p.y, u_res.x * .5 - p.x) + (r - .5) * 1.4;
	}
	// Walkers far from what the page is about drift home: they start again near the focus.
	vec2 d = abs(p - u_focus.xy) - u_focus.zw;
	float away = length(max(d, 0.));
	float home = smoothstep(u_reachPx * .5, u_reachPx * 1.6, away) * .03 * u_focusOn;
	if (r2 < u_scatter + home) {
		vec2 q = vec2(hash(gl_FragCoord.xy + u_frame), hash(gl_FragCoord.yx - u_frame));
		vec2 anywhere = q * u_res;
		vec2 near = u_focus.xy + (q * 2. - 1.) * (u_focus.zw + u_reachPx * .7);
		p = clamp(mix(anywhere, near, step(.5, u_focusOn)), vec2(2.), u_res - 2.);
		a = r * 6.2832;
	}
	outAgent = vec4(p, mod(a, 6.2832), agent.w);
}
