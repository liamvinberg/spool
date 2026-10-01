precision highp float;
varying vec2 v_uv;
// The light behind the letters. Only the glyphs show it: the type layer above
// multiplies this picture away everywhere else. Where nothing shines the letters
// are warm white; where the red falls they fill with the landing's pigment.
uniform vec2 u_size;    // css px
uniform float u_time;
uniform vec4 u_light;   // css px x, y, radius px, strength
uniform vec4 u_second;  // a trailing light: x, y, radius px, strength
uniform float u_flood;  // every letter lit at once

const vec3 WHITE = vec3(.94, .925, .91);
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
float pool(vec2 px, vec4 light, float value) {
 float d=length(px-light.xy)/max(light.z,1.);
 return (1.-smoothstep(.15,1.05,d+(value-.5)*.85))*light.w;
}

void main() {
 vec2 px=vec2(v_uv.x,1.-v_uv.y)*u_size;
 float t=u_time*.06;
 float value=pigment(px/520.,t);
 float amount=max(pool(px,u_light,value),pool(px,u_second,value));
 amount=max(amount,u_flood*(.72+.28*value));

 // Deep in the pool the pigment runs from oxblood to the landing's red to a hot core.
 vec3 ink=mix(vec3(.6,.1,.045),RED,smoothstep(.3,.68,value));
 ink=mix(ink,vec3(1.,.5,.34),smoothstep(.62,.9,value)*amount*.7);
 vec3 color=mix(WHITE,ink,clamp(amount*1.15,0.,1.));
 color+=(hash(px+.37)-.5)/255.;
 gl_FragColor=vec4(color,1.);
}
