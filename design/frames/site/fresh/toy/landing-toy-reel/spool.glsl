precision highp float;
uniform vec2 u_center; // drawing-buffer pixels, y up
uniform float u_scale; // drawing-buffer pixels per unit
uniform float u_rot;   // radians the spool has turned
uniform float u_r;     // radius of the wound thread, in units

const float EL = .40;      // camera elevation
const float FR = 1.;       // flange radius
const float FH = .085;     // flange half thickness
const float FY = 1.07;     // flange centre height
const float TH = .985;     // thread half height
const float HOLE = .13;
const float CORE = .37;
const float PITCH = .034;
const vec3 RED = vec3(.961, .224, .102);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3. - 2. * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
}
float sdCyl(vec3 p, float r, float h) {
	vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
	return min(max(d.x, d.y), 0.) + length(max(d, 0.));
}
float sdRCyl(vec3 p, float r, float h, float rr) { return sdCyl(p, r - rr, h - rr) - rr; }

// x: distance, y: material (1 wood, 2 thread, 3 bore)
vec2 map(vec3 p) {
	float radial = length(p.xz);
	vec3 q = p;
	q.y = abs(p.y) - FY;
	float wood = sdRCyl(q, FR, FH, .045);
	// The slit in the top rim that holds the loose end, turning with the spool.
	vec2 turned = rot(u_rot) * p.xz;
	float slit = max(abs(turned.y) - .012 - max(turned.x - .84, 0.) * .14, .84 - turned.x);
	if (p.y > 0.) wood = max(wood, -slit);
	float bore = max(sdCyl(p, CORE, FY), HOLE - radial);
	wood = max(wood, HOLE - radial);
	float thread = max(sdCyl(p, u_r, TH), CORE - .01 - radial);
	vec2 hit = vec2(wood, 1.);
	if (thread < hit.x) hit = vec2(thread, 2.);
	if (bore < hit.x) hit = vec2(bore, 3.);
	return hit;
}

vec3 normalAt(vec3 p) {
	vec2 e = vec2(.0012, 0.);
	return normalize(vec3(
		map(p + e.xyy).x - map(p - e.xyy).x,
		map(p + e.yxy).x - map(p - e.yxy).x,
		map(p + e.yyx).x - map(p - e.yyx).x));
}

float shadow(vec3 p, vec3 l) {
	float s = 1., t = .02;
	for (int i = 0; i < 28; i++) {
		float h = map(p + l * t).x;
		s = min(s, 9. * h / t);
		t += clamp(h, .02, .18);
		if (s < .02 || t > 3.) break;
	}
	return clamp(s, 0., 1.);
}

vec3 shade(vec3 p, vec3 rd, float material) {
	vec3 n = normalAt(p);
	vec3 key = normalize(vec3(-.55, .85, .5));
	vec3 fill = normalize(vec3(.8, .1, .6));
	vec3 view = -rd;
	float sh = shadow(p + n * .004, key);
	float phi = atan(p.z, p.x);
	vec3 col;
	if (material > 1.5 && material < 2.5) {
		// Thread: fine wraps that travel as the spool turns, crossed by a slow second layer.
		float wraps = p.y / PITCH - (phi - u_rot) / 6.2831853;
		float wrap = fract(wraps);
		float crown = 1. - abs(wrap - .5) * 2.;
		// Below a few pixels per wrap the lines would alias; let them blend.
		float detail = clamp((PITCH * u_scale - 1.6) / 3., 0., 1.);
		crown = mix(.72, crown, detail);
		float cross = .5 + .5 * sin((p.y * 2.2 + (phi - u_rot) * 1.0) * 3.);
		float tone = hash(vec2(floor(wraps), 3.)) * .08;
		float fibre = noise(vec2(wraps * 3., (phi - u_rot) * 90.)) * .14;
		vec3 base = RED * (.8 + tone - fibre) * mix(.88, 1.03, cross);
		base = mix(base * .58, base, smoothstep(.0, .8, crown));
		vec3 tangent = normalize(vec3(-sin(phi), PITCH * .2, cos(phi)));
		vec3 half_ = normalize(key + view);
		float th = dot(tangent, half_);
		float sheen = pow(sqrt(max(0., 1. - th * th)), 44.) * smoothstep(.15, .95, crown);
		float wrapped = max(dot(n, key) * .6 + .4, 0.);
		float edge = smoothstep(0., .16, TH - abs(p.y));
		float occl = mix(.42, 1., edge);
		col = base * (wrapped * mix(.35, 1., sh) * occl + .08);
		col += vec3(1., .66, .55) * sheen * .42 * sh;
		col += base * max(dot(n, fill), 0.) * .12;
	} else if (material < 1.5) {
		// Birch: grain cut along one direction, so a turn reads on the face.
		vec3 tp = p;
		tp.xz = rot(u_rot) * p.xz;
		float warp = noise(tp.xz * vec2(1.6, 5.)) * 2.4 + noise(tp.xz * 11.) * .5;
		float grain = sin(tp.z * 34. + warp * 3.) * .5 + .5;
		float fleck = noise(tp.xz * vec2(18., 70.) + tp.y * 9.);
		vec3 a = vec3(.92, .82, .66);
		vec3 b = vec3(.80, .66, .49);
		vec3 base = mix(a, b, grain * .45 + fleck * .2);
		float rim = 1. - abs(n.y);
		base *= mix(1., .9, rim);
		float diff = max(dot(n, key), 0.);
		float spec = pow(max(dot(reflect(-key, n), view), 0.), 24.) * .1;
		float inner = smoothstep(.3, .0, length(p.xz) - HOLE);
		col = base * (diff * mix(.4, 1., sh) * .82 + .16) + spec * sh;
		col *= mix(1., .55, inner * step(.5, n.y));
	} else {
		col = vec3(.05, .045, .04);
	}
	float rim = pow(1. - max(dot(n, view), 0.), 3.);
	col += vec3(.95, .55, .45) * rim * .07;
	return col;
}

void main() {
	vec2 s = (gl_FragCoord.xy - u_center) / u_scale;
	vec3 back = vec3(0., sin(EL), cos(EL));
	vec3 right = vec3(1., 0., 0.);
	vec3 up = vec3(0., cos(EL), -sin(EL));
	vec3 ro = right * s.x + up * s.y + back * 4.;
	vec3 rd = -back;
	float pixel = 1. / u_scale;
	// Most pixels are empty table; skip them before marching.
	if (abs(s.x) > 1.08 || abs(s.y) > 1.62) { gl_FragColor = vec4(0.); return; }
	float t = 0., closest = 1e9, at = 0.;
	vec2 hit = vec2(1e9, 0.);
	for (int i = 0; i < 110; i++) {
		hit = map(ro + rd * t);
		if (hit.x < closest) { closest = hit.x; at = t; }
		if (hit.x < .0006) break;
		t += hit.x * .8;
		if (t > 8.) break;
	}
	float cover = hit.x < .0006 ? 1. : clamp(1. - closest / pixel, 0., 1.);
	if (cover <= 0.) { gl_FragColor = vec4(0.); return; }
	float tt = hit.x < .0006 ? t : at;
	vec3 p = ro + rd * tt;
	vec3 col = shade(p, rd, map(p).y);
	col = pow(col, vec3(.95));
	gl_FragColor = vec4(col * cover, cover);
}
