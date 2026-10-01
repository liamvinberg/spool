#version 300 es
// The tone screened as one colour of round dots at 45 degrees, red on black
// stock. Each dot takes its size from the tone at its own centre, the way an
// AM halftone does, and neighbouring cells are checked so dark tones close up
// into solid ink. Dots are a little irregular and the ink a little mottled.
// On entry a squeegee pulls the ink across from the left.
precision highp float;
out vec4 outColor;
uniform sampler2D u_tone;
uniform vec2 u_size;
uniform float u_top;
uniform float u_ratio;
uniform float u_cell;
uniform float u_pull;

const vec3 BG = vec3(.0627);
const vec3 RED = vec3(.961, .224, .102);
const float ANGLE = .7853982;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3. - 2. * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
}

void main() {
	vec2 frag = gl_FragCoord.xy / u_ratio;
	vec2 px = vec2(frag.x, u_top + u_size.y - frag.y);
	mat2 toScreen = rot(ANGLE);
	mat2 toPage = rot(-ANGLE);
	vec2 q = toScreen * px;
	vec2 cell = floor(q / u_cell);
	float pull = 1. - pow(1. - u_pull, 3.);
	float edgeX = mix(-.15, 1.2, pull) * u_size.x;
	float aa = .7 / u_ratio;
	float rough = (noise(px * 1.4) - .5) * .32;
	float cover = 0.;
	float local = 0.;
	for (int j = -1; j <= 1; j++) {
		for (int i = -1; i <= 1; i++) {
			vec2 centre = (cell + vec2(i, j) + .5) * u_cell;
			vec2 at = toPage * centre;
			vec2 uv = vec2(at.x / u_size.x, 1. - (at.y - u_top) / u_size.y);
			float tone = texture(u_tone, uv).r;
			// The squeegee: nothing ahead of the blade, a little flood just behind it.
			float edge = edgeX - (at.y - u_top) * .18 + (noise(at * .02) - .5) * 90.;
			float behind = at.x < edge ? 1. : 0.;
			float flood = exp(-max(edge - at.x, 0.) / 70.) * (1. - u_pull);
			tone = clamp(tone + flood * .35 * step(.02, tone), 0., 1.) * mix(behind, 1., step(1., u_pull));
			float radius = u_cell * .74 * sqrt(tone) + (hash(cell + vec2(i, j)) - .5) * .5 * step(.02, tone);
			float d = length(q - centre) + rough;
			float spot = (1. - smoothstep(radius - aa, radius + aa, d)) * step(.015, tone);
			cover = max(cover, spot);
			if (i == 0 && j == 0) local = tone;
		}
	}
	float mottle = mix(mix(.84, 1., noise(px * .045)), 1., smoothstep(.6, .9, local));
	vec3 ink = RED * mottle;
	float stock = (hash(floor(px * u_ratio)) - .5) * .016 + (noise(px * .012) - .5) * .012;
	vec3 color = mix(BG + stock, ink, cover * mix(.93, 1., smoothstep(.8, 1., local)));
	outColor = vec4(color, 1.);
}
