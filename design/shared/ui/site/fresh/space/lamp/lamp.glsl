#version 300 es
precision highp float;
// A plaster wall in a dark room, lit by one lamp. The wall's relief comes from
// a texture painted off the page's own layout: raised type, plates, carved
// lines and pigment. Every pixel is shaded as a real surface: a normal from the
// height, inverse-square falloff, soft shadows marched across the height toward
// the lamp, and pigment that glows red where the light lands and for a moment
// after it has passed.
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_size;      // css px of the screen
uniform sampler2D u_wall;
uniform vec2 u_wallSize;  // css px of the whole wall
uniform float u_offset;   // wall y at the top of the screen
uniform vec4 u_lamp;      // screen x, y, height above the wall (css px), strength
uniform float u_reach;    // css px where the lamp has fallen to a quarter
uniform float u_moon;     // a faint raking light from a high window
uniform float u_time;
uniform float u_warm;     // the last room: the lamp turns up
uniform float u_stain;    // how much the pigment shows before any light reaches it
#define TRAIL 16
uniform vec4 u_trail[TRAIL]; // wall x, y, strength, radius

const vec3 BG = vec3(.0627451);
const vec3 RED = vec3(.961, .224, .102);
const vec3 LAMP = vec3(1., .87, .72);
const float RAISE = 9.;
const float CARVE = 6.;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float noise(vec2 p) {
 vec2 i = floor(p), f = fract(p);
 f = f*f*(3. - 2.*f);
 return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
}
float fbm(vec2 p) {
 float n = 0., a = .5;
 for (int i = 0; i < 4; i++) { n += a*noise(p); p = rot(.53)*p*2.03 + 3.7; a *= .5; }
 return n;
}
float pigment(vec2 p, float t) {
 vec2 drift = vec2(fbm(p*2.3 + vec2(t, 0.)), fbm(p*2.3 + vec2(4.2, -t))) - .5;
 return fbm(p*3. + drift*3. + vec2(t, t*.4));
}

vec4 wallAt(vec2 w) { return texture(u_wall, w/u_wallSize); }
float relief(vec4 t) { return t.r*RAISE - t.b*CARVE; }
// Trowelled plaster: broad waves, then grit.
float plaster(vec2 w) {
 return noise(w*.012)*1.6 + noise(w*.05)*.55 + noise(w*.23)*.22 + noise(w*.9)*.09;
}
float heightAt(vec2 w) { return relief(wallAt(w)) + plaster(w); }

void main() {
 vec2 px = vec2(v_uv.x, 1. - v_uv.y)*u_size;
 vec2 w = px + vec2(0., u_offset);
 vec4 here = wallAt(w);
 float h = relief(here) + plaster(w);

 // The surface normal, from the height around this point.
 float e = 1.;
 float hx = heightAt(w + vec2(e, 0.)) - heightAt(w - vec2(e, 0.));
 float hy = heightAt(w + vec2(0., e)) - heightAt(w - vec2(0., e));
 vec3 N = normalize(vec3(-hx/(2.*e), -hy/(2.*e), 1.));

 // The lamp, in wall coordinates.
 vec3 L = vec3(u_lamp.x, u_lamp.y + u_offset, u_lamp.z);
 vec3 P = vec3(w, h);
 vec3 toL = L - P;
 float dist = length(toL);
 vec3 l = toL/dist;
 float lambert = max(dot(N, l), 0.);
 float fall = pow(1./(1. + (dist/u_reach)*(dist/u_reach)*2.2), 1.4);
 fall *= 1. - smoothstep(u_reach*2.2, u_reach*3.4, dist);

 // Soft shadow: walk toward the lamp across the height and see what stands in the way.
 float shade = 1.;
 vec2 dir = toL.xy;
 float flat_ = length(dir);
 if (flat_ > 1. && lambert > 0.) {
  dir /= flat_;
  float reach = min(flat_, 70.);
  float rise = (L.z - h)/flat_;
  float t = 1.2;
  for (int i = 0; i < 22; i++) {
   vec2 q = w + dir*t;
   float hq = relief(wallAt(q));
   float ray = h + t*rise;
   shade = min(shade, 14.*(ray - hq)/t);
   t += max(1.2, t*.14);
   if (t > reach || shade < 0.) break;
  }
  // Light bounces off the rest of the wall, so a shadow is never a hole.
  shade = mix(.22, 1., clamp(shade, 0., 1.));
 }

 // The window: a faint raking light from the upper left, so nothing is ever quite black.
 vec3 m = normalize(vec3(-.62, -.5, .32));
 float moon = pow(max(dot(N, m), 0.), 1.6)*u_moon;

 // Materials: warm plaster, red pigment where the wall holds it.
 float t = u_time*.04;
 float cloud = smoothstep(.26, .7, pigment(w/520., t));
 float inlay = smoothstep(.55, .9, here.g);
 float pig = max(inlay, here.g*cloud*1.35);
 pig = clamp(pig, 0., 1.);
 float grit = hash(floor(px*1.));
 vec3 plasterCol = vec3(.6, .575, .54)*(.9 + .14*noise(w*.03)) ;
 // Cast faces were smoothed before they set, so they hold a touch more light.
 float face = smoothstep(.55, .95, here.r);
 plasterCol *= 1. + face*.12;
 vec3 albedo = mix(plasterCol, RED*vec3(.95, .9, .9), pig*.92);

 // A matte sheen on the raised edges.
 vec3 H = normalize(l + vec3(0., 0., 1.));
 float sheen = pow(max(dot(N, H), 0.), 30.)*(.1 + face*.12)*(1. - pig*.5);

 float strength = u_lamp.w*(1. + u_warm*.45);
 float lit = lambert*fall*shade*strength;
 vec3 color = BG*(1. - min(1., lit*.8));
 color += albedo*LAMP*lit*1.55;
 color += LAMP*sheen*fall*shade*strength;
 color += albedo*vec3(.5, .55, .62)*moon*.16;

 // Pigment glows where it is lit, and keeps a little of the light after the lamp moves on.
 float after = 0.;
 for (int i = 0; i < TRAIL; i++) {
  vec4 tr = u_trail[i];
  if (tr.z < .002) continue;
  vec2 d = (w - tr.xy)/tr.w;
  after += tr.z*exp(-dot(d, d));
 }
 float glow = pig*(pow(lambert*fall*shade, .7)*strength*.85 + min(after, 1.2)*.6);
 color += RED*glow*(.6 + .5*cloud);
 color += RED*pig*u_stain;

 // Print grain, a soft lens falloff, and dither so the long falloff never bands.
 color *= .94 + grit*.1;
 vec2 vq = (px - u_size*.5)/u_size;
 color *= 1. - dot(vq, vq)*.35;
 color += (hash(px + .37) - .5)/255.;
 outColor = vec4(color, 1.);
}
