precision highp float;
varying vec2 v_uv;
// A piece of cloth on a loom, drawn thread by thread. World units are threads:
// warp i runs down x in [i, i+1), weft row j runs across y in [j, j+1), y down.
// The layout constants mirror cloth.ts.
uniform vec2 u_size;      // css px
uniform vec3 u_cam;       // world x, world y at the screen centre, css px per thread
uniform float u_time;
uniform float u_picks;    // rows woven; the fraction is the shuttle's way across the next row
uniform vec3 u_light;     // direction the light comes from
uniform vec4 u_point;     // world x, world y, core radius px, visibility
uniform float u_drape;    // 0 taut on the loom, 1 cut off and breathing
uniform vec4 u_patch;     // cells x0, y0, x1, y1 woven plain dark for the closing words
uniform vec4 u_quiet;     // px box the copy sits in
uniform float u_quietness;

const float W = 96.;
const float ROWS = 130.;
const float FIG = 24.;
const float PIG = 68.;
const float PI = 3.14159265;

const vec3 BG = vec3(.0627451);
const vec3 RED = vec3(.961, .224, .102);

float hash1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
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
// The landing's pigment, frozen: the same field the current page blooms, here woven in.
float pigment(vec2 p) {
	vec2 drift = vec2(fbm(p * 2.3 + vec2(.2, 0.)), fbm(p * 2.3 + vec2(4.2, -.2))) - .5;
	return fbm(p * 3. + drift * 3. + vec2(.2, .08));
}

float sdBox(vec2 p, vec2 c, vec2 h) {
	vec2 d = abs(p - c) - h;
	return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}
float boxPx(vec2 px, vec4 b) {
	vec2 d = abs(px - b.xy - b.zw * .5) - b.zw * .5;
	return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

// The walk between the four frames: under, over, under, as the film's thread went.
float pathY(float x, out float slope) {
	float a = 61., b = 81., sg = 1.;
	if (x < 41.) { a = 16.; b = 41.; sg = 1.; }
	else if (x < 61.) { a = 41.; b = 61.; sg = -1.; }
	float t = (x - a) / (b - a);
	slope = sg * 13. * PI / (b - a) * cos(PI * t);
	return 20. + sg * 13. * sin(PI * t);
}

// The figure band, in cells from its first row: 0 ground, 1 a frame's edge, 2 inside, 3 the walk.
float figure(vec2 c) {
	float k = 0.;
	float d = sdBox(c, vec2(16., 20.), vec2(10., 7.));
	d = min(d, sdBox(c, vec2(41., 20.), vec2(10., 7.)));
	d = min(d, sdBox(c, vec2(61., 20.), vec2(5., 11.)));
	d = min(d, sdBox(c, vec2(81., 20.), vec2(10., 7.)));
	if (d < 0.) k = d > -2. ? 1. : 2.;
	if (c.x > 16. && c.x < 81.) {
		float s;
		float y = pathY(c.x, s);
		if (abs(c.y - y) / sqrt(1. + s * s) < 1.05) k = 3.;
	}
	return k;
}

// Whether the weft passes over warp i on row j. Each band of the cloth is one section of the page.
float weftUp(float i, float j) {
	float plain = mod(i + j, 2.) < .5 ? 1. : 0.;
	if (j < 2. || j >= ROWS - 2. || (j >= FIG + 40. && j < PIG)) return plain;
	// The first red: a weft-faced 3/1 twill, so the colour leads and a fine diagonal runs through it.
	if (j < FIG) return mod(i - j, 4.) < .5 ? 0. : 1.;
	float rank8 = mod(i - 3. * j, 8.);
	if (j < FIG + 40.) {
		float k = figure(vec2(i + .5, j - FIG + .5));
		if (k < .5) return rank8 < .5 ? 1. : 0.;             // ground: warp-faced satin, dark and glossy
		if (k < 1.5 || k > 2.5) return rank8 < .5 ? 0. : 1.; // edges and the walk: weft-faced satin
		return plain;                                        // inside: plain weave, a half tone
	}
	// The pigment, shaded by an eight-end satin order the way a jacquard shades.
	float p = min(.78, smoothstep(.32, .7, pigment(vec2(i, j - PIG) * .014)));
	if (i >= u_patch.x && i < u_patch.z && j >= u_patch.y && j < u_patch.w) p = 0.;
	// Ranks scattered along the row (a move-5 satin), so mid tones read as grain rather than dashes.
	float scatter = mod(3. * i + j, 8.);
	return (scatter + .5) / 8. < p ? 1. : 0.;
}

float woven(float j, float x) {
	float done = floor(u_picks);
	if (j < 0. || j >= ROWS || j > done + .5) return 0.;
	if (j < done) return 1.;
	float tip = -2. + fract(u_picks) * (W + 4.);
	return mod(done, 2.) < .5 ? step(x, tip) : step(W - tip, x);
}

// One thread seen from above: a two-ply yarn whose fibres wind round it at an angle,
// so the sheen runs across each ply in a diagonal streak the way silk catches light.
vec3 thread(float c, float along, float slope, float h, vec3 albedo, vec3 sheen, vec3 L, vec3 H, float seed, float fine) {
	float z = sqrt(max(1. - c * c, 0.));
	vec3 n = normalize(vec3(c * .9, -slope * .35, z + .12));
	float diff = clamp((dot(n, L) + .45) / 1.45, 0., 1.);
	// Two plies twisted round each other: a soft groove where they meet.
	float ply = abs(fract(along * 1.9 - c * .5 + seed) - .5) * 2.;
	float groove = mix(1., mix(.7, 1., smoothstep(0., .5, ply)), fine);
	// Each fibre is a helix round the yarn; its tangent sets where the sheen sits.
	float tw = .62;
	vec3 T = normalize(vec3(tw * z, 1., -tw * c + slope * .3));
	float th = dot(T, H);
	float kk = pow(sqrt(max(1. - th * th, 0.)), 38.);
	float broad = pow(max(dot(n, H), 0.), 6.);
	float fibre = noise(vec2((along * 1.2 + c * .62) * 30., c * 2. + seed * 7.));
	float ao = .22 + .78 * smoothstep(-1., 1., h);
	vec3 col = albedo * (.2 + .8 * diff) * groove * ao * (1. + (fibre - .5) * .45 * fine);
	col += sheen * (kk * .55 * (.55 + .9 * fibre * fine + .45 * (1. - fine)) + broad * .12) * ao * groove;
	return col;
}

void main() {
	vec2 px = vec2(v_uv.x, 1. - v_uv.y) * u_size;
	float pitch = u_cam.z;
	vec2 w = (px - u_size * .5) / pitch + u_cam.xy;

	// Off the loom the cloth breathes: a slow swell that turns the light across it.
	vec2 fold = vec2(0.);
	if (u_drape > .001) {
		float a = w.x * .05 + w.y * .021 + u_time * .31;
		float b = -w.x * .023 + w.y * .058 - u_time * .23;
		fold = (vec2(.05, .021) * cos(a) * .6 + vec2(-.023, .058) * cos(b) * .4) * u_drape * 13.;
		w.y += (.6 * sin(a) + .4 * sin(b)) * .45 * u_drape;
	}

	vec3 L = normalize(u_light);
	vec3 H = normalize(L + vec3(0., 0., 1.));
	float i = floor(w.x), j = floor(w.y);
	vec2 f = fract(w) - .5;
	float fine = smoothstep(11., 26., pitch);

	// The warp: present across the cloth, frayed into tassels above the first row,
	// and running on below the fell into the dark of the loom until the cloth is cut.
	float finished = step(ROWS - .001, u_picks);
	float warpOn = step(0., i) * step(i, W - 1.);
	float tassel = 2.5 + 4. * hash1(i * 3.3);
	float taper = 0.;
	if (w.y < 0.) {
		warpOn *= 1. - smoothstep(tassel - 1.2, tassel, -w.y);
		taper = clamp(-w.y / tassel, 0., 1.);
	}
	float after = w.y - ROWS;
	if (finished > .5 && after > 0.) {
		float tail = 2. + 4. * hash1(i * 5.1);
		warpOn *= 1. - smoothstep(tail - 1.2, tail, after);
		taper = clamp(after / tail, 0., 1.);
	}
	float below = max(0., w.y - u_picks) * (1. - finished);
	float warpFade = mix(1., .5, smoothstep(0., 3., below)) * mix(1., .25, smoothstep(5., 45., below));

	float ox = (hash1(i) - .5) * .07 + (noise(vec2(i * 3.1, w.y * .13)) - .5) * .09 + sin(w.y * .8 + i) * .1 * taper;
	float oy = (hash1(j + 77.) - .5) * .08 + (noise(vec2(w.x * .08, j * 2.7)) - .5) * .11;
	float hwW = (.43 + .04 * noise(vec2(i * 1.7, w.y * .37))) * mix(1., .82, smoothstep(0., 2., below));
	float hwF = .47 + .04 * noise(vec2(w.x * .29, j * 3.3));
	float ca = (f.x - ox) / hwW;
	// Past the cloth's edge the yarn untwists: its two plies part and thin out.
	if (taper > 0.) {
		float spread = hwW * .5 + taper * .16;
		ca = (abs(f.x - ox) - spread) / (hwW * (.5 - taper * .12));
	}
	float cb = (f.y - oy) / hwF;

	float wv = woven(j, w.x) * step(-.38, w.x) * step(w.x, W + .38);
	float up = weftUp(i, j);

	// Heights along each thread, from its own crossing to the next one.
	float sy = f.y > 0. ? 1. : -1.;
	float jn = j + sy;
	float rowHere = woven(j, i + .5);
	float rowNext = woven(jn, i + .5);
	float hw0 = rowHere > .5 ? (up > .5 ? -1. : 1.) : 0.;
	float hwn = rowNext > .5 ? (weftUp(i, jn) > .5 ? -1. : 1.) : 0.;
	float xy = abs(f.y) * 2.;
	float hWarp = mix(hw0, hwn, .5 * smoothstep(0., 1., xy));
	float slopeW = (hwn - hw0) * 3. * xy * (1. - xy) * sy;

	float sx = f.x > 0. ? 1. : -1.;
	float inb = i + sx;
	float hf0 = up > .5 ? 1. : -1.;
	float hfn = (inb >= 0. && inb <= W - 1.) ? (weftUp(inb, j) > .5 ? 1. : -1.) : hf0;
	float xx = abs(f.x) * 2.;
	// A weft caught over a single warp is pinched flat and sits in that warp's shadow.
	float pinned = 0.;
	if (up > .5 && hfn < 0. && (inb - 2. * sx < 0. || inb - 2. * sx > W - 1. || weftUp(i - sx, j) < .5)) pinned = 1.;
	float hWeft = mix(hf0, hfn, .5 * smoothstep(0., 1., xx));
	float slopeF = (hfn - hf0) * 3. * xx * (1. - xx) * sx;

	float aaW = 1.2 / (pitch * hwW);
	float aaF = 1.2 / (pitch * hwF);
	float covW = (1. - smoothstep(1. - aaW, 1. + aaW, abs(ca))) * warpOn;
	float covF = (1. - smoothstep(1. - aaF, 1. + aaF, abs(cb))) * wv;

	vec3 warpAlb = vec3(.095, .09, .087) * (.82 + .36 * hash1(i * 1.9));
	vec3 weftAlb = (j < 2. || j >= ROWS - 2.) ? vec3(.105, .098, .094) : vec3(.84, .16, .065) * (.9 + .2 * hash1(j * 1.7));
	vec3 warpSheen = vec3(.5, .48, .47);
	vec3 weftSheen = (j < 2. || j >= ROWS - 2.) ? warpSheen : vec3(1., .6, .46);

	vec3 warpCol = thread(ca, w.y, slopeW, hWarp, warpAlb, warpSheen, L, H, hash1(i) * 3., fine) * warpFade;
	vec3 weftCol = thread(cb, w.x, slopeF, hWeft, weftAlb, weftSheen, L.yxz, H.yxz, hash1(j + 9.) * 3., fine) * mix(1., .42, pinned);

	// Whatever sits lower is shaded by what crosses over it.
	vec3 gap = BG * mix(1., .5, wv * step(0., w.x) * step(w.x, W));
	vec3 col = gap;
	if (hWeft > hWarp) {
		col = mix(col, warpCol * mix(1., .55, covF), covW);
		col = mix(col, weftCol, covF);
	} else {
		col = mix(col, weftCol * mix(1., .55, covW * step(.001, covW)), covF);
		col = mix(col, warpCol, covW);
	}
	// A loose hair or two catching the light off each thread's edge.
	float hair = smoothstep(.82, .97, noise(vec2((w.x + w.y * .6) * 9., (w.y - w.x * .6) * 1.3)));
	float near = (1. - covW) * (1. - covF) * max(warpOn * step(abs(ca), 1.7), wv * step(abs(cb), 1.5));
	col += (wv > .5 ? weftSheen * .09 : warpSheen * .06) * hair * near * fine;

	col *= 1. + dot(fold, L.xy);

	// The point, and the light it throws on the cloth around it.
	vec2 pp = (u_point.xy - u_cam.xy) * pitch + u_size * .5;
	float dp = length(px - pp);
	float r = u_point.z;
	col *= 1. + exp(-dp / (r * 10.)) * 1.3 * u_point.w;
	float core = 1. - smoothstep(r - .8, r + .8, dp);
	float halo = exp(-dp / (r * 3.2)) * .5 + exp(-dp / (r * 14.)) * .12;
	col = mix(col, RED, clamp(halo, 0., 1.) * u_point.w);
	col = mix(col, vec3(1., .36, .2), core * u_point.w);

	float quiet = 1. - smoothstep(-10., 160., boxPx(px, u_quiet));
	col = mix(col, BG, quiet * u_quietness);
	col += (hash(px + .37) - .5) / 255.;
	gl_FragColor = vec4(max(col, vec3(0.)), 1.);
}
