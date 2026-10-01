#version 300 es
precision highp float;
// Where the network has ever been, fading over minutes rather than frames.
uniform sampler2D u_trail;
uniform sampler2D u_history;
uniform vec2 u_res;
uniform float u_keep;
uniform float u_gain;
out vec4 outHistory;
void main() {
	vec2 uv = gl_FragCoord.xy / u_res;
	float now = 1. - exp(-max(texture(u_trail, uv).r, 0.) * u_gain);
	float was = texture(u_history, uv).r * u_keep;
	outHistory = vec4(max(was, now), 0., 0., 1.);
}
