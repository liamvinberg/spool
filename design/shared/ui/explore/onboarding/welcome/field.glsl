precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform float u_step;
uniform float u_variant;

// The pigment material from spool.page's bloom/field.glsl, composed for a
// three-step welcome. One continuous field changes its footprint, never resets.
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
void main() {
 vec2 st=vec2(v_uv.x,1.-v_uv.y);
 float first=clamp(u_step,0.,1.);
 float second=clamp(u_step-1.,0.,1.);
 vec2 center=vec2(.81,.40);
 vec2 radius=vec2(.32,.48);
 float power=.98;
 if(u_variant<.5) {
  center+=vec2(-.025*first,.055*first+.045*second);
  radius+=vec2(.015,.02)*u_step;
  power=.83;
 } else if(u_variant<1.5) {
  center=mix(mix(vec2(.83,.40),vec2(.76,.23),first),vec2(.88,.64),second);
  radius=mix(mix(vec2(.36,.55),vec2(.48,.37),first),vec2(.46,.60),second);
  power=1.22;
 } else {
  center=mix(mix(vec2(.50,.26),vec2(.80,.40),first),vec2(.87,.27),second);
  radius=mix(mix(vec2(.23,.26),vec2(.38,.46),first),vec2(.55,.58),second);
  power=mix(1.12,.65,second);
 }
 vec2 px=st*u_size;
 float scale=clamp(u_size.x*.43,340.,700.);
 vec2 p=(px-center*u_size)/scale;
 // A small continuous shift lets the material turn with the motion of the pool.
 p=rot(u_step*.12)*p+vec2(u_step*.06,0.);
 float value=pigment(p,u_time*.048);
 float cloud=smoothstep(.255,.735,value);
 vec2 d=(st-center)/radius;
 float pool=exp(-dot(d,d)*2.);
 float grain=hash(floor(px));
 float amount=cloud*pool*power;
 // The centered direction has a quiet middle once choices arrive.
 if(u_variant>1.5) {
  vec2 quiet=(st-vec2(.48,.57))/vec2(.35,.28);
  amount*=1.-exp(-dot(quiet,quiet)*2.)*.52*first;
 }
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 float opacity=clamp(amount*(.67+grain*.44),0.,1.);
 gl_FragColor=vec4(mix(BG,ink,opacity),1.);
}
