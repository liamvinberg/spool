precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform vec4 u_pose;
uniform vec2 u_bend;

// The site's pigment stays alive while its shape and material coordinates move.
const vec3 BG=vec3(.0627451);
const vec3 RED=vec3(.961,.224,.102);
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
mat2 rot(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float noise(vec2 p) {
 vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p) {
 float n=0.,a=.5;
 for(int i=0;i<4;i++) { n+=a*noise(p);p=rot(.53)*p*2.03+3.7;a*=.5; }
 return n;
}
float pigment(vec2 p,float t) {
 vec2 drift=vec2(fbm(p*2.3+vec2(t,0.)),fbm(p*2.3+vec2(4.2,-t)))-.5;
 return fbm(p*3.+drift*3.+vec2(t,t*.4));
}
void main() {
 vec2 uv=vec2(v_uv.x,1.-v_uv.y),px=uv*u_size;
 float scale=clamp(u_size.x*.43,420.,700.);
 vec2 displacement=(u_pose.xy-vec2(.79,.39))*u_size;
 vec2 domain=(px-vec2(u_size.x*.76,320.)-displacement*.72)/scale;
 domain=rot(u_bend.x)*domain;
 // Smooth, broad bending of the existing pigment, without changing its seed.
 domain+=vec2(sin(domain.y*2.1),sin(domain.x*1.7))*u_bend.y;
 float value=pigment(domain,u_time*.048);
 vec2 q=rot(u_bend.x)*((uv-u_pose.xy)*vec2(u_size.x/u_size.y,1.));
 q/=u_pose.zw*vec2(u_size.x/u_size.y,1.);
 float pool=exp(-dot(q,q)*2.);
 float grain=hash(floor(px));
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 float opacity=clamp(smoothstep(.255,.735,value)*pool*1.03*(.67+grain*.44),0.,1.);
 gl_FragColor=vec4(mix(BG,ink,opacity),1.);
}
