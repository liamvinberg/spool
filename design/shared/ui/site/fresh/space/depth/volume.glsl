#version 300 es
precision highp float;
// A dark volume the camera flies through. Blank planes stand for frames; red
// pigment hangs between them as sheets of fog at fixed depths, so moving the
// camera gives real parallax. Everything is composited front to back along each
// ray, and every edge is softened by its own circle of confusion, which is the
// whole depth of field: a plane far from the focus distance arrives soft.
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_size;      // css px
uniform float u_time;
uniform vec3 u_eye;
uniform vec3 u_right;
uniform vec3 u_up;
uniform vec3 u_fwd;
uniform float u_focal;    // css px from the eye to the image plane
uniform float u_focus;    // distance that is sharp, world units
uniform float u_aperture;
uniform sampler2D u_pigment;

#define PLANES 6
uniform vec4 u_pc[PLANES]; // centre xyz, visibility
uniform vec4 u_pr[PLANES]; // right axis, half width
uniform vec4 u_pu[PLANES]; // up axis, half height
uniform vec4 u_pm[PLANES]; // x heat from the walk, y how much is written, z warmth

#define THREAD 64
uniform vec4 u_thread[THREAD];
uniform float u_threadCount;
uniform float u_threadDrawn; // segments drawn, fractional
uniform float u_threadAlpha;

#define BLOBS 4
uniform vec4 u_blob[BLOBS]; // centre xyz, radius
uniform vec4 u_blobAmt;
uniform float u_flood;
uniform vec4 u_bead;      // the point that walks the thread: xyz, visibility
uniform vec4 u_quiet;     // px box the copy sits in
uniform float u_quietness;

const vec3 BG = vec3(.0627451);
const vec3 RED = vec3(.961, .224, .102);
const float SPACING = 1.25;
const int SHEETS = 30;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }
float box(vec2 p, vec2 hs) {
 vec2 d = abs(p) - hs;
 return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}
float boxPx(vec2 px, vec4 b) {
 vec2 d = abs(px - b.xy - b.zw*.5) - b.zw*.5;
 return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}
float coc(float depth) {
 return u_aperture*abs(1./u_focus - 1./max(depth, .05))*u_size.y;
}
float envelope(vec3 p) {
 float e = 0.;
 for (int i = 0; i < BLOBS; i++) {
  vec3 d = (p - u_blob[i].xyz)/u_blob[i].w;
  e += u_blobAmt[i]*exp(-dot(d, d)*1.6);
 }
 return e;
}

void main() {
 vec2 px = vec2(v_uv.x, 1. - v_uv.y)*u_size;
 vec3 ro = u_eye;
 vec3 rd = normalize(u_fwd*u_focal + u_right*(px.x - u_size.x*.5) + u_up*(u_size.y*.5 - px.y));
 float along = dot(rd, u_fwd);
 vec2 seed = gl_FragCoord.xy;
 float grain = hash(floor(px));

 // Layers: the six planes and the thread, each a colour at a distance.
 float lt[7];
 vec4 lc[7];
 int n = 0;

 vec3 key = normalize(vec3(-.35, .8, .5));
 for (int i = 0; i < PLANES; i++) {
  vec4 c = u_pc[i];
  if (c.w < .002) continue;
  vec3 r = u_pr[i].xyz, up = u_pu[i].xyz;
  vec3 nrm = cross(r, up);
  float denom = dot(rd, nrm);
  if (abs(denom) < 1e-4) continue;
  float t = dot(c.xyz - ro, nrm)/denom;
  if (t < .06) continue;
  vec3 p = ro + rd*t;
  vec2 q = vec2(dot(p - c.xyz, r), dot(p - c.xyz, up));
  vec2 hs = vec2(u_pr[i].w, u_pu[i].w);
  float depth = t*along;
  float ppu = u_focal/max(depth, .05);
  float sd = box(q, hs)*ppu;
  float blur = max(.7, coc(depth));
  float cover = 1. - smoothstep(-blur, blur, sd);
  if (cover < .002) continue;

  // A sheet of milky glass: lit from the upper left, falling into shadow
  // toward the far corner, and warmed from behind by any pigment it sits in.
  vec3 N = nrm*-sign(denom);
  float lambert = .62 + .38*dot(N, key);
  vec2 k = q/hs;
  float v = k.y;
  float fall = smoothstep(-1.5, 1.15, dot(k, vec2(-.42, .9)));
  vec3 paper = vec3(.93, .9, .86)*mix(.16, .86, fall)*lambert;
  float glow = clamp(envelope(p), 0., 1.6);
  paper += RED*glow*(.16 + .14*(1. - fall)) + u_pm[i].z*RED*.35;
  // A lit hairline on the edges that face the light, a darker one on the rest.
  float rimPx = abs(sd);
  float rim = exp(-rimPx/max(.9, blur*.6));
  float facing = smoothstep(-.2, .6, dot(normalize(k + 1e-4), vec2(-.5, .85)));
  paper += vec3(1., .96, .92)*rim*mix(.04, .3, facing);
  // Unwritten paper is only an outline; the line being written glows.
  float written = u_pm[i].y;
  float yFromTop = hs.y - q.y;
  float head = 2.*hs.y*written;
  float solid = 1. - smoothstep(head - 1.2/ppu, head + 1.2/ppu, yFromTop);
  float outline = rim*.85;
  float writing = step(.001, written)*(1. - step(.999, written));
  float writeHead = exp(-abs(yFromTop - head)*ppu/2.2)*writing*step(sd, 0.);
  vec3 col = paper*solid + vec3(.62, .58, .55)*outline*(1. - solid);
  col += RED*writeHead*1.4;
  float alpha = cover*max(solid*.94, max(outline*(1. - solid)*.9, writeHead));
  // Heat: the walk reaching a sheet lights it from the middle, where the thread goes through.
  float heat = u_pm[i].x*exp(-dot(k, k)*1.3);
  col = mix(col, col*vec3(1.04, .7, .6) + RED*.32, clamp(heat*1.2, 0., 1.));
  col += RED*u_pm[i].x*.08;
  // Passing through a sheet: it gets out of the way.
  alpha *= c.w*smoothstep(.3, 1.4, depth);

  lt[n] = t;
  lc[n] = vec4(col, alpha);
  n++;
 }

 // The thread, as the nearest point of a polyline to this ray.
 float threadT = 1e9, threadPx = 1e9, threadBlur = 1., threadNear = 1.;
 if (u_threadAlpha > .002) {
  int count = int(u_threadCount);
  for (int j = 0; j < THREAD - 1; j++) {
   if (j + 1 >= count) break;
   float fj = float(j);
   if (fj >= u_threadDrawn) break;
   vec3 a = u_thread[j].xyz;
   vec3 b = u_thread[j + 1].xyz;
   if (fj + 1. > u_threadDrawn) b = mix(a, b, u_threadDrawn - fj);
   vec3 ab = b - a;
   vec3 w0 = ro - a;
   float A = dot(rd, rd), B = dot(rd, ab), C = dot(ab, ab), D = dot(rd, w0), E = dot(ab, w0);
   float den = A*C - B*B;
   float s = den > 1e-6 ? clamp((A*E - B*D)/den, 0., 1.) : 0.;
   float t = max(dot(a + ab*s - ro, rd), .06);
   vec3 P = ro + rd*t;
   vec3 Q = a + ab*s;
   float depth = t*along;
   float dpx = length(P - Q)*u_focal/max(depth, .05);
   if (dpx < threadPx) {
    threadPx = dpx;
    threadT = t;
    threadBlur = min(coc(depth), 36.);
    threadNear = smoothstep(.5, 2.2, depth);
   }
  }
  float width = 1.1 + threadBlur*.35;
  float core = 1. - smoothstep(width - .6, width + .6 + threadBlur*.5, threadPx);
  float energy = clamp(1.8/(1. + threadBlur*.3), .06, 1.)*threadNear;
  if (core > .002) {
   lt[n] = threadT;
   lc[n] = vec4(mix(RED, vec3(1., .5, .34), .35)*1.2, core*energy*u_threadAlpha);
   n++;
  }
 }

 // Nearest first.
 for (int i = 1; i < 7; i++) {
  if (i >= n) break;
  float tk = lt[i];
  vec4 ck = lc[i];
  int j = i - 1;
  while (j >= 0 && lt[j] > tk) {
   lt[j + 1] = lt[j];
   lc[j + 1] = lc[j];
   j--;
  }
  lt[j + 1] = tk;
  lc[j + 1] = ck;
 }

 vec3 acc = vec3(0.);
 float T = 1.;
 int li = 0;
 float quiet = (1. - smoothstep(-10., 160., boxPx(px, u_quiet)))*u_quietness;

 if (rd.z < -.05) {
  float first = floor(ro.z/SPACING);
  for (int k = 0; k < SHEETS; k++) {
   float id = first - float(k);
   float z = id*SPACING;
   float t = (z - ro.z)/rd.z;
   while (li < n && lt[li] < t) {
    acc += T*lc[li].rgb*lc[li].a;
    T *= 1. - lc[li].a;
    li++;
   }
   if (t <= 0.) continue;
   if (T < .01) break;
   vec3 p = ro + rd*t;
   float depth = t*along;
   float near = smoothstep(.8, 4.5, depth);
   float far = 1. - smoothstep(float(SHEETS)*SPACING*.62, float(SHEETS)*SPACING*.95, depth);
   float fade = near*far;

   // The pigment, a different crop of the tile on every sheet.
   float a = id*1.71;
   mat2 turn = mat2(cos(a), -sin(a), sin(a), cos(a));
   vec2 uv = turn*(p.xy/15.) + hash2(vec2(id, 3.1));
   vec4 tex = texture(u_pigment, uv);
   float value = tex.r;
   float cloud = smoothstep(.5, .76, value);
   float env = envelope(p) + u_flood*1.05;
   float dens = cloud*env*fade*(1. - quiet);
   vec3 ink = mix(vec3(.42, .055, .028), RED, smoothstep(.5, .74, value));
   float amount = clamp(pow(dens, 1.2)*.62, 0., .9);
   acc += T*ink*amount*(.7 + grain*.45);
   T *= 1. - amount*.55;

   // Dust: a few motes on each sheet, drawn as discs the size of their blur.
   vec2 cell = floor(p.xy*.55);
   vec2 h = hash2(cell + id*7.13);
   if (h.x < .16) {
    vec2 mote = (cell + .2 + .6*hash2(cell + id*3.7 + 1.3))/.55;
    float dpx = length(p.xy - mote)*u_focal/max(depth, .05);
    float rr = max(.9, coc(depth)*.9);
    float disc = 1. - smoothstep(rr - .8, rr + .6, dpx);
    float rim = disc*smoothstep(rr*.55, rr, dpx)*.35;
    float energy = min(1., 3.2/(rr*rr*.5 + 2.));
    vec3 tint = mix(vec3(1., .86, .78), RED, h.y);
    acc += T*tint*(disc*.6 + rim)*energy*fade*.55*(.4 + h.y*.6);
   }
  }
 }
 while (li < n) {
  acc += T*lc[li].rgb*lc[li].a;
  T *= 1. - lc[li].a;
  li++;
 }

 // The thread's glow is light, not paper: it reaches past what covers it a little.
 if (u_threadAlpha > .002 && threadPx < 1e8) {
  acc += RED*exp(-threadPx/(9. + threadBlur))*.2*u_threadAlpha*threadNear;
 }

 // The walking point is light: a crisp core and a wide halo, seen through anything.
 if (u_bead.w > .002) {
  vec3 bp = u_bead.xyz - ro;
  float bz = dot(bp, u_fwd);
  if (bz > .2) {
   float bpx = length(cross(rd, bp))*u_focal/bz;
   float br = 3.2 + min(coc(bz), 24.)*.5;
   float core = 1. - smoothstep(br - .8, br + .8, bpx);
   float halo = exp(-bpx/(br*3.))*.55 + exp(-bpx/(br*14.))*.14;
   acc += (RED*halo + vec3(1., .42, .26)*core)*u_bead.w;
  }
 }

 vec3 color = acc + T*BG;
 // A soft vignette keeps the eye in the middle of the volume.
 vec2 vq = (px - u_size*.5)/u_size;
 color *= 1. - dot(vq, vq)*.45;
 color += (hash(seed + .37) - .5)/255.;
 outColor = vec4(color, 1.);
}
