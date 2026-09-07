precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform float u_scroll;
uniform float u_total;
uniform float u_take;
uniform float u_reduced;
uniform vec4 u_hero;
uniform vec4 u_try;
uniform vec4 u_compare;
uniform vec4 u_agent;
uniform vec4 u_files;
uniform vec4 u_start;
uniform vec4 u_boxes[7];
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
float bank(vec2 px, vec4 box, float radius) {
 float d=distanceToBox(px,box);
 return exp(-pow((d-24.)/radius,2.));
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
 float progress=px.y/max(u_total,1.);

 if(u_take<.5 || u_take>5.5) {
  // Returns: generous darkness between three related appearances.
  float middle=pool(px,vec2(u_size.x*.16,u_compare.y+95.),vec2(scale*.9,360.));
  amount=cloud*max(hero*1.03,max(middle*.72,closing*1.06));
  if(u_take>5.5) {
   // Returns above; one broader closing surface, softening through the footer.
   float arrival=smoothstep(u_start.y-70.,u_start.y+250.,px.y);
   float release=mix(1.,.36,smoothstep(u_start.y+u_start.w*.7,u_total,px.y));
   float ending=arrival*release;
   amount=mix(amount,.60+cloud*.34,ending);
   warm=ending*.8;
  }
 } else if(u_take<1.5) {
  // Current: a continuous meander, rather than a new cloud in each section.
  float path=.5+.43*cos((px.y-290.)/900.);
  float river=exp(-pow((st.x-path)/.205,2.));
  float tributary=exp(-pow((st.x-path-.22*sin(px.y/560.))/.34,2.));
  amount=cloud*(river*.94+tributary*.12);
  amount*=.66+.34*sin(px.y/460.+.5);
  amount=max(amount,hero*cloud*1.2);
 } else if(u_take<2.5) {
  // Atmosphere: low, wide fields share one surface, with no sectional reset.
  float wide=pigment(p*.52+vec2(1.3,.6),t*.65);
  float islands=smoothstep(.22,.69,wide);
  amount=(cloud*.25+islands*.22)*(.32+.68*smoothstep(.12,.96,st.x));
  amount+=hero*cloud*.30;
  value=mix(value,wide,.22);
  warm=.025;
 } else if(u_take<3.5) {
  // Companion: a single volume moves through the viewport as the page advances.
  float journey=u_scroll/max(u_total-u_size.y,1.);
  float cx=mix(.76,.5+.36*cos(journey*6.28318),1.-u_reduced);
  float cy=.36+.11*sin(journey*6.28318);
  vec2 local=(st*u_size-vec2(u_size.x*cx,u_size.y*cy))/scale;
  float living=pigment(local,t);
  float body=exp(-dot(local*vec2(.8,1.15),local*vec2(.8,1.15))*1.1);
  value=living;
  amount=smoothstep(.255,.735,living)*body*1.3;
  grain=hash(floor(st*u_size));
 } else if(u_take<4.5) {
  // Surrounds: the same pigment catches at the edges of the product surfaces.
  float halo=0.;
  for(int i=0;i<7;i++) halo=max(halo,bank(px,u_boxes[i],105.));
  amount=cloud*(halo*1.05+hero*.95+closing*.65);
 } else {
  // Immersion: a growing field resolves into a full-width vermilion closing.
  float path=.74+.22*sin(px.y/860.);
  float field=exp(-pow((st.x-path)/.44,2.));
  amount=cloud*field*(.65+progress*.7);
  amount=max(amount,hero*cloud*1.25);
  float arrival=smoothstep(u_start.y-210.,u_start.y+120.,px.y);
  float release=1.-smoothstep(u_start.y+u_start.w-35.,u_total,px.y);
  float immersed=arrival*release;
  amount=mix(amount,.72+cloud*.28,immersed);
  warm=immersed;
 }

 // Keep the body copy quiet while letting larger type touch the material.
 float quiet=0.;
 for(int i=0;i<12;i++) {
  float d=distanceToBox(px,u_quiet[i]);
  quiet=max(quiet,1.-smoothstep(-4.,95.,d));
 }
 float quietStrength=u_take>5.5?mix(.68,.26,smoothstep(u_start.y,u_start.y+220.,px.y)):(u_take>4.5?.20:.68);
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
