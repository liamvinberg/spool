#version 300 es
precision highp float;
// The trail as pigment: oxblood where it is thin, the spool red where it runs,
// near white at the hottest junctions. The history shows as a cool ash under it.
uniform sampler2D u_trail;
uniform sampler2D u_history;
uniform vec2 u_size;      // canvas px
uniform float u_exposure;
uniform float u_ghost;
uniform float u_fade;     // the whole field, 0 to 1
uniform vec4 u_point;     // canvas px x, y, radius, visibility
out vec4 outColor;

const vec3 BG = vec3(.0627451);
const vec3 DEEP = vec3(.29, .045, .022);
const vec3 RED = vec3(.961, .224, .102);
const vec3 HOT = vec3(1., .72, .58);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
	vec2 uv = gl_FragCoord.xy / u_size;
	float v = max(texture(u_trail, uv).r, 0.);
	float t = 1. - exp(-v * u_exposure);
	vec3 ink = mix(DEEP, RED, smoothstep(.2, .7, t));
	ink = mix(ink, HOT, smoothstep(.82, 1., t) * .65);
	// Capillaries stay faint and deep; only the veins reach the full red.
	float amount = smoothstep(.0, .08, t) * .55 + smoothstep(.08, .55, t) * .45;
	vec3 col = mix(BG, ink, amount * u_fade);

	// Old paths, as a thin ash line where the network used to run.
	float ghost = smoothstep(.62, .95, texture(u_history, uv).r) * u_ghost;
	col = mix(col, vec3(.45, .42, .4), ghost * .45 * (1. - amount));

	vec2 px = gl_FragCoord.xy;
	float dp = length(px - u_point.xy);
	float r = u_point.z;
	float core = 1. - smoothstep(r - 1., r + 1., dp);
	float halo = exp(-dp / (r * 3.)) * .55 + exp(-dp / (r * 12.)) * .14;
	col = mix(col, RED, clamp(halo, 0., 1.) * u_point.w);
	col = mix(col, vec3(1., .86, .78), core * u_point.w);

	col += (hash(px + .37) - .5) / 255.;
	outColor = vec4(col, 1.);
}
