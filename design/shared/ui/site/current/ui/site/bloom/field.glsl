precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform float u_scroll;
uniform float u_total;
uniform vec4 u_compare;
uniform vec4 u_start;
uniform vec4 u_quiet[12];

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
float distanceToBox(vec2 p, vec4 box) {
 vec2 d=abs(p-box.xy-box.zw*.5)-box.zw*.5;
 return length(max(d,0.))+min(max(d.x,d.y),0.);
}
float pool(vec2 px, vec2 center, vec2 radius) {
 vec2 d=(px-center)/radius;
 return exp(-dot(d,d)*2.);
}
void main() {
 vec2 st=vec2(v_uv.x,1.-v_uv.y);
 vec2 px=st*u_size+vec2(0.,u_scroll);
 float scale=clamp(u_size.x*.43,420.,700.);
 // The domain is in document coordinates. Scrolling reveals the same material.
 vec2 p=(px-vec2(u_size.x*.76,320.))/scale;
 float t=u_time*.048;
 float value=pigment(p,t);
 float cloud=smoothstep(.255,.735,value);
 float amount=0.;
 float warm=0.;
 float grain=hash(floor(px));
 float hero=pool(px, vec2(u_size.x*.79,310.),vec2(scale*.92,300.));
 float closing=pool(px,vec2(u_size.x*.66,u_start.y+u_start.w*.43),vec2(scale*1.5,u_start.w*.85));
 // The selected returns-end composition, in document coordinates.
 float middle=pool(px,vec2(u_size.x*.16,u_compare.y+95.),vec2(scale*.9,360.));
 amount=cloud*max(hero*1.03,max(middle*.72,closing*1.06));
 float arrival=smoothstep(u_start.y-70.,u_start.y+250.,px.y);
 float release=mix(1.,.36,smoothstep(u_start.y+u_start.w*.7,u_total,px.y));
 float ending=arrival*release;
 amount=mix(amount,.60+cloud*.34,ending);
 warm=ending*.8;

 // Keep the body copy quiet while letting larger type touch the material.
 float quiet=0.;
 for(int i=0;i<12;i++) {
  float d=distanceToBox(px,u_quiet[i]);
  quiet=max(quiet,1.-smoothstep(-4.,95.,d));
 }
 float quietStrength=mix(.68,.26,smoothstep(u_start.y,u_start.y+220.,px.y));
 amount*=1.-quiet*quietStrength;
 float top=smoothstep(15.,125.,px.y);
 amount*=top;
 float mobile=mix(.44,1.,smoothstep(600.,1050.,u_size.x));
 amount*=mobile;
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 ink=mix(ink,vec3(.72,.115,.045),warm*.75);
 float opacity=clamp(amount*(.67+grain*.44),0.,1.);
 vec3 color=mix(BG,ink,opacity);
 gl_FragColor=vec4(color,1.);
}
