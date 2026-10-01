precision highp float;
varying vec2 v_uv;
// The type is the set and the shader is the lighting. One red lamp moves
// behind the words: its shafts stream through the gaps between letters, the
// letters cast shadows into the haze, and their edges catch the light.
uniform sampler2D u_type;  // letter coverage in alpha, the size of the screen
uniform vec2 u_size;       // css px
uniform vec4 u_light;      // px x, px y, radius px, power
uniform float u_face;      // front light, so the words always read
uniform float u_near;      // how much letters near the lamp brighten
uniform float u_flood;
uniform float u_time;

const vec3 BG = vec3(.043, .039, .038);
const vec3 RED = vec3(.961, .224, .102);
const vec3 HOT = vec3(1., .56, .36);
const vec3 CREAM = vec3(.94, .91, .87);
const int STEPS = 36;

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
float cover(vec2 px) { return texture2D(u_type, px/u_size).a; }
float bulb(vec2 px) {
 vec2 d=(px-u_light.xy)/u_light.z;
 return exp(-dot(d,d)*2.2)+.2*exp(-length(d)*1.3);
}

void main() {
 vec2 px=vec2(v_uv.x,1.-v_uv.y)*u_size;
 float m=cover(px);
 vec2 toLight=u_light.xy-px;
 float t=u_time*.04;
 float scale=min(u_size.x,u_size.y);

 // March toward the lamp, gathering whatever light the letters let through.
 float shafts=0., weight=1.;
 float jitter=hash(px);
 for(int i=0;i<STEPS;i++) {
  float k=(float(i)+jitter)/float(STEPS);
  vec2 q=px+toLight*k;
  shafts+=bulb(q)*(1.-cover(q))*weight;
  weight*=.975;
 }
 shafts*=2.6/float(STEPS);
 // The haze the light travels through: the same pigment the other films use.
 float haze=.3+.9*pigment(px/scale*1.3,t);
 float direct=bulb(px)*(1.-m);
 float light=(shafts*haze+direct*.45)*u_light.w;
 vec3 color=BG+RED*min(light,1.15)*.95+HOT*pow(clamp(light,0.,1.),4.)*.3;

 // The ending: the haze fills with light, as the current page ends in pigment.
 float field=pigment(px/scale*.9,t);
 vec3 flood=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,field))*(.55+.35*smoothstep(.25,.75,field));
 color=mix(color,max(color,flood),u_flood);

 // Letters: dark faces lifted by a front light, edges that catch the lamp.
 float e=1.5;
 vec2 grad=vec2(cover(px+vec2(e,0.))-cover(px-vec2(e,0.)),cover(px+vec2(0.,e))-cover(px-vec2(0.,e)));
 float edge=length(grad);
 vec2 normal=-grad/(edge+.0001);
 float reach=exp(-length(toLight)/(u_light.z*3.))*u_light.w;
 float rim=clamp(dot(normal,normalize(toLight+.0001)),0.,1.)*clamp(edge*1.4,0.,1.)*reach;
 vec3 letter=vec3(.07,.064,.062)+CREAM*clamp(u_face+u_near*reach,0.,1.)*.92+(RED*1.3+HOT*.4)*rim*1.5;
 letter=mix(letter,CREAM*.96,u_flood*.6);
 color=mix(color,letter,m);

 color+=(hash(px+.37)-.5)/255.;
 gl_FragColor=vec4(color,1.);
}
