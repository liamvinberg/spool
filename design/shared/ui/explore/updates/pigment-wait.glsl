precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform float u_cover;
uniform float u_exit;
uniform float u_take;
const vec3 BG=vec3(.055);
const vec3 RED=vec3(.961,.224,.102);
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=a*noise(p);p=rot(.53)*p*2.03+3.7;a*=.5;}return n;}
float pigment(vec2 p,float t){vec2 drift=vec2(fbm(p*2.3+vec2(t,0)),fbm(p*2.3+vec2(4.2,-t)))-.5;return fbm(p*3.+drift*3.+vec2(t,t*.4));}
void main(){
 vec2 st=vec2(v_uv.x,1.-v_uv.y);
 float aspect=u_size.x/u_size.y;
 vec2 p=(st-vec2(.5,.46))*vec2(aspect,1.);
 float t=u_time;
 float grain=hash(floor(st*u_size));
 float c=u_cover;
 float amount=0.;float alpha=0.;float value=0.;
 if(u_take<6.5){
  // A complete moving ring, never a percentage arc. Its centre is always calm.
  vec2 flowing=rot(t*.19)*p;
  value=pigment(flowing*1.75,t*.13);
  float angle=atan(p.y,p.x);
  float radius=.30+.014*sin(angle*3.-t*.85)+.009*sin(angle*5.+t*.46);
  float width=.026+value*.038;
  float band=exp(-pow((length(p)-radius)/width,2.));
  float body=exp(-pow((length(p)-radius)/(.09+value*.03),2.));
  amount=band*(.30+value*.63)+body*.075;
  float reach=(1.-c)*1.6-.10;
  alpha=smoothstep(reach-.035,reach+.035,length(p)+.025*(value-.5));
 }else if(u_take<7.5){
  // A broad tide with independent shape travel and pigment advection.
  vec2 flow=vec2(st.x*1.7-t*.048,st.y*1.3);
  value=pigment(flow,t*.115);
  float crest=.72+.065*sin(st.x*4.2-t*.64)+.025*sin(st.x*8.+t*.38);
  float band=exp(-pow((st.y-crest)/.115,2.));
  float wake=exp(-pow((st.y-crest-.17)/.19,2.));
  amount=band*(.14+value*.58)+wake*.14;
  float edge=1.18-c*1.45+.045*sin(st.x*5.-t*.64);
  alpha=smoothstep(edge-.04,edge+.04,st.y);
 }else{
  // The landing material pulled into a flowing vertical fold, away from text.
  vec2 flow=vec2(st.x*1.35,st.y*1.15-t*.085);
  value=pigment(flow,t*.15);
  float spine=.76+.055*sin(st.y*5.-t*.7)+.025*sin(st.y*9.+t*.38);
  float width=.065+.04*value;
  float band=exp(-pow((st.x-spine)/width,2.));
  float wake=exp(-pow((st.x-spine+.075)/.17,2.));
  amount=band*(.2+value*.58)+wake*.12;
  float travel=mix(c,1.-c,u_exit);
  float edge=travel*1.4-.2+.09*sin(st.y*3.14)*sin(travel*3.14);
  alpha=mix(1.-smoothstep(edge-.04,edge+.04,st.x),smoothstep(edge-.04,edge+.04,st.x),u_exit);
 }
 vec3 ink=mix(vec3(.30,.036,.020),RED,smoothstep(.28,.72,value));
 vec3 color=mix(BG,ink,clamp(amount*(.83+grain*.28),0.,1.));
 alpha=mix(alpha,0.,1.-smoothstep(0.,.008,c));
 alpha=mix(alpha,1.,smoothstep(.992,1.,c));
 gl_FragColor=vec4(color,alpha);
}
