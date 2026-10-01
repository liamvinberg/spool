precision highp float;
varying vec2 v_uv;
// Forked from the landing's pigment field. Here the material is a world the
// camera moves through: one point, the pool it blooms into, the frames that
// pool becomes, and the flood the film ends in. World units, y pointing down.
uniform vec2 u_size;      // css px
uniform float u_unit;     // css px per world unit at zoom 1
uniform float u_time;
uniform vec3 u_cam;       // world x, world y, zoom
uniform vec4 u_point;     // world x, world y, core radius px, visibility
uniform vec4 u_pool;      // world x, world y, radius, strength
uniform vec4 u_frames[4]; // world centre x, y, half width, half height
uniform vec4 u_lit;       // how much each frame shows its material
uniform vec4 u_hot;       // the walk passing through each frame
uniform float u_flood;
uniform float u_dim;
uniform vec4 u_quiet;     // px box the copy sits in
uniform float u_quietness;

const vec3 BG = vec3(.0627451);
const vec3 RED = vec3(.961, .224, .102);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float noise(vec2 p) {
 vec2 i = floor(p), f = fract(p);
 f = f*f*(3.-2.*f);
 return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+1.), f.x), f.y);
}
float fbm(vec2 p) {
 float n=0., a=.5;
 for(int i=0; i<4; i++) { n+=a*noise(p); p=rot(.53)*p*2.03+3.7; a*=.5; }
 return n;
}
float pigment(vec2 p, float t) {
 vec2 drift=vec2(fbm(p*2.3+vec2(t,0.)), fbm(p*2.3+vec2(4.2,-t)))-.5;
 return fbm(p*3.+drift*3.+vec2(t,t*.4));
}
float box(vec2 p, vec2 hs) {
 vec2 d=abs(p)-hs;
 return length(max(d,0.))+min(max(d.x,d.y),0.);
}
float boxPx(vec2 px, vec4 b) {
 vec2 d=abs(px-b.xy-b.zw*.5)-b.zw*.5;
 return length(max(d,0.))+min(max(d.x,d.y),0.);
}

void main() {
 vec2 px=vec2(v_uv.x,1.-v_uv.y)*u_size;
 float zoom=u_cam.z;
 float scale=u_unit*zoom;
 vec2 w=(px-u_size*.5)/scale+u_cam.xy;
 float t=u_time*.05;
 float value=pigment(w*.9,t);
 float cloud=smoothstep(.255,.735,value);
 float grain=hash(floor(px));

 // The bloom the point turns into, with an edge the material itself decides.
 float d=length(w-u_pool.xy)/max(u_pool.z,.0001);
 float pool=(1.-smoothstep(.45,1.05,d+(value-.5)*.9))*u_pool.w;
 float amount=pool*(.35+cloud*.95);

 // Frames are windows onto the same material, lit as the walk passes through.
 float px1=1./scale;
 float edges=0.;
 for(int i=0;i<4;i++) {
  vec4 f=u_frames[i];
  float lit=i==0?u_lit.x:i==1?u_lit.y:i==2?u_lit.z:u_lit.w;
  float hot=i==0?u_hot.x:i==1?u_hot.y:i==2?u_hot.z:u_hot.w;
  float sd=box(w-f.xy,f.zw);
  float inside=1.-smoothstep(-px1,px1,sd);
  float glow=exp(-max(sd,0.)*scale/40.)*(1.-inside);
  amount=max(amount,inside*lit*(.22+cloud*(.5+.55*hot)));
  edges=max(edges,glow*lit*(.05+.2*hot));
 }

 // The ending: the whole frame fills with the material, as the current page ends.
 amount=mix(amount,.58+cloud*.36,u_flood);

 float quiet=1.-smoothstep(-10.,140.,boxPx(px,u_quiet));
 amount*=1.-quiet*u_quietness;
 amount*=1.-u_dim;

 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 ink=mix(ink,vec3(.72,.115,.045),u_flood*.6);
 float opacity=clamp(amount*(.67+grain*.44)+edges,0.,1.);
 vec3 color=mix(BG,ink,opacity);

 // The point stays crisp at any zoom: its size lives in screen pixels.
 vec2 pp=(u_point.xy-u_cam.xy)*scale+u_size*.5;
 float dp=length(px-pp);
 float r=u_point.z;
 float core=1.-smoothstep(r-.8,r+.8,dp);
 float halo=exp(-dp/(r*3.2))*.5+exp(-dp/(r*14.))*.12;
 vec3 hotRed=vec3(1.,.36,.2);
 color=mix(color,RED,clamp(halo,0.,1.)*u_point.w);
 color=mix(color,hotRed,core*u_point.w);
 // Dither so the long halo falloff never bands.
 color+=(hash(px+.37)-.5)/255.;
 gl_FragColor=vec4(color,1.);
}
