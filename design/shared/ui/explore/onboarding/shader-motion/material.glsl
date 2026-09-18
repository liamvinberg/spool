precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec2 u_from;
uniform vec2 u_to;
uniform float u_time;
uniform float u_progress;
const float PI=3.14159265;
const vec3 BG=vec3(.0627451);
const vec3 RED=vec3(.961,.224,.102);

// The pigment/noise vocabulary from the spool.page field. Every take shares
// the same material and endpoints; the files change what happens in between.
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
mat2 rot(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float noise(vec2 p) {
 vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p) {
 float n=0.,a=.5;
 for(int i=0;i<4;i++) { n+=a*noise(p); p=rot(.53)*p*2.03+3.7; a*=.5; }
 return n;
}
float pigment(vec2 p) {
 float t=u_time*.048;
 vec2 drift=vec2(fbm(p*2.3+vec2(t,0.)),fbm(p*2.3+vec2(4.2,-t)))-.5;
 return fbm(p*3.+drift*3.+vec2(t,t*.4));
}
vec2 domain(vec2 uv,vec2 center) { return (uv-center)*vec2(u_size.x/u_size.y,1.)/vec2(.62,.45); }
float envelope(vec2 q) { return exp(-dot(q,q)*1.65); }
vec4 field(vec2 q,float mask) {
 float value=pigment(q);
 float alpha=clamp(smoothstep(.24,.74,value)*mask*1.4,0.,1.);
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 return vec4(ink*alpha,alpha);
}
vec4 base(vec2 uv,vec2 center) { vec2 q=domain(uv,center); return field(q,envelope(q)); }
vec4 layer(vec4 a,vec4 b) { return a+b*(1.-a.a); }
float ease(float p) { return p*p*(3.-2.*p); }
float pulse(float p) { return sin(PI*p); }

