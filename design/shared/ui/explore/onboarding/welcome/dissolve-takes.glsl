precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform float u_from;
uniform float u_to;
uniform float u_progress;
uniform float u_take;

// The material and spreading reveal are from spool.page's bloom shader.
// Time and material coordinates never reset between onboarding steps.
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
vec4 pose(float step) {
 if(step<.5) return vec4(.79,.39,.40,.43);
 if(step<1.5) return vec4(.77,.23,.41,.39);
 return vec4(.86,.63,.43,.48);
}
float pool(vec2 uv,vec4 location) {
 vec2 q=(uv-location.xy)/location.zw;
 return exp(-dot(q,q)*2.);
}
float siteReveal(vec2 px,vec2 center,float scale,float value,float reveal) {
 // Same growing, softly irregular edge as the site's opening.
 float growth=1.-pow(1.-reveal,3.);
 float edge=length((px-center)/vec2(scale,440.));
 float reach=growth*3.1-.35;
 float mask=(1.-smoothstep(reach-.24,reach+.24,edge+(value-.5)*.48))*smoothstep(0.,.12,reveal);
 return mix(mask,1.,smoothstep(.85,1.,reveal));
}
float density(float value,float presence) {
 float thin=1.-presence;
 return smoothstep(.255+thin*.24,.735+thin*.18,value)*presence;
}
void main() {
 vec2 uv=vec2(v_uv.x,1.-v_uv.y),px=uv*u_size;
 float scale=clamp(u_size.x*.43,420.,700.);
 vec2 domain=(px-vec2(u_size.x*.76,320.))/scale;
 float value=pigment(domain,u_time*.048);
 float cloud=smoothstep(.255,.735,value);
 vec4 before=pose(u_from),after=pose(u_to);
 float p=clamp(u_progress,0.,1.);
 float old=0.,next=0.;
 if(u_take<.5) {
  // Clear: fully dissolve, leave a brief empty beat, regather throughout.
  float leave=1.-smoothstep(0.,.40,p);
  float arrive=smoothstep(.49,1.,p);
  old=density(value,leave)*pool(uv,before);
  next=density(value,arrive)*pool(uv,after);
 } else if(u_take<1.5) {
  // Bloom: dissolve completely, then replay the website's own entrance.
  float leave=1.-smoothstep(0.,.32,p);
  float arrive=clamp((p-.42)/.58,0.,1.);
  old=density(value,leave)*pool(uv,before);
  next=cloud*pool(uv,after)*siteReveal(px,after.xy*u_size,scale,value,arrive);
 } else if(u_take<2.5) {
  // Overlap: the new pool begins to spread through the fading old material.
  float leave=1.-smoothstep(0.,.74,p);
  float arrive=clamp((p-.25)/.75,0.,1.);
  old=density(value,leave)*pool(uv,before);
  next=cloud*pool(uv,after)*siteReveal(px,after.xy*u_size,scale,value,arrive);
 } else {
  // Recede: the soft perimeter withdraws inward before it grows elsewhere.
  float leave=1.-smoothstep(0.,.42,p);
  float edge=length((px-before.xy*u_size)/vec2(scale,440.))+(value-.5)*.48;
  float reach=leave*1.85-.35;
  float retreat=(1.-smoothstep(reach-.28,reach+.28,edge))*smoothstep(0.,.13,leave);
  retreat=mix(retreat,1.,smoothstep(.88,1.,leave));
  old=cloud*pool(uv,before)*retreat;
  float arrive=clamp((p-.49)/.51,0.,1.);
  next=cloud*pool(uv,after)*siteReveal(px,after.xy*u_size,scale,value,arrive);
 }
 // Both layers expose the same material. Union prevents a bright overlap flash.
 float amount=old+next-old*next;
 float grain=hash(floor(px));
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 float opacity=clamp(amount*1.03*(.67+grain*.44),0.,1.);
 gl_FragColor=vec4(mix(BG,ink,opacity),1.);
}
