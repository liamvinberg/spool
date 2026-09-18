precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform float u_cover;
uniform float u_exit;
uniform float u_take;
const vec3 BG=vec3(.055);
const vec3 RED=vec3(.961,.224,.102);
const float PI=3.14159265;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
// Material from spool.page: four octaves, domain warp, thread red, fixed grain.
float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=a*noise(p);p=rot(.53)*p*2.03+3.7;a*=.5;}return n;}
float pigment(vec2 p,float t){vec2 drift=vec2(fbm(p*2.3+vec2(t,0)),fbm(p*2.3+vec2(4.2,-t)))-.5;return fbm(p*3.+drift*3.+vec2(t,t*.4));}
float softLine(float distance,float width){return exp(-pow(distance/width,2.));}
void main(){
 vec2 st=vec2(v_uv.x,1.-v_uv.y);
 float aspect=u_size.x/u_size.y;
 vec2 p=(st-vec2(.76,.48))*vec2(aspect,1.);
 float grain=hash(floor(st*u_size));
 float alpha=0.;vec3 color=BG;
 float c=u_cover;
 float travel=mix(c,1.-c,u_exit);
 float tension=sin(travel*PI);
 if(u_take<.5){
  alpha=c;
  float line=softLine((st.x-.5)*u_size.x,1.1);
  float reach=smoothstep(.20,.45,st.y)*(1.-smoothstep(.67,.83,st.y));
  color=mix(BG,RED,line*reach*.75);
 }else if(u_take<1.5){
  // A bowed ribbon crosses once. Release continues in the same direction.
  float bend=sin(st.y*PI)*.15*tension;
  float edge=travel*1.4-.2-bend;
  float d=st.x-edge;
  alpha=mix(1.-smoothstep(-.007,.007,d),smoothstep(-.007,.007,d),u_exit);
  float lip=softLine(d+.013,.014)*(.7+.3*sin(st.y*PI));
  float fold=exp(-abs(d+.045)*20.)*.09;
  color=BG+fold;
  color=mix(color,RED,lip*.8);
  float strand=softLine((st.x-.80)*u_size.x,1.0)*.14;
  color=mix(color,RED,strand);
 }else if(u_take<2.5){
  // Pigment pools inward, then breaks open around the same quiet centre.
  float value=pigment(p,u_time*.017);
  float distance=length(p)+(.5-value)*.42;
  float growth=c*2.4-.30;
  float entry=1.-smoothstep(growth-.14,growth+.14,distance);
  vec2 opening=(st-vec2(.28,.46))*vec2(aspect,1.);
  float outDistance=length(opening)+(.5-value)*.30;
  float openingSize=(1.-c)*2.6-.25;
  float leaving=smoothstep(openingSize-.15,openingSize+.15,outDistance);
  alpha=mix(entry,leaving,u_exit);
  float pool=exp(-dot(p,p)*2.1);
  float cloud=smoothstep(.28,.73,value);
  vec3 ink=mix(vec3(.24,.026,.015),RED,cloud);
  color=mix(BG,ink,pool*(.32+cloud*.65)*(.8+grain*.22));
 }else if(u_take<3.5){
  // Curved strands arrive in a cascade; each has its own eased travel.
  float warpedY=st.y+sin(st.x*PI)*.052*tension;
  float row=floor(warpedY*14.);
  float local=clamp((travel-row*.009)/.86,0.,1.);
  local=local*local*(3.-2.*local);
  float edge=local*1.3-.15;
  float x=mod(row,2.)<1.?st.x:1.-st.x;
  float d=x-edge;
  alpha=mix(1.-smoothstep(-.006,.006,d),smoothstep(-.006,.006,d),u_exit);
  float seam=1.-smoothstep(0.,.025,fract(warpedY*14.));
  float wave=.5+.5*sin(st.x*5.+row*.36+u_time*.13);
  color=mix(BG,vec3(.20,.035,.022),wave*.40);
  color=mix(color,RED,max(seam*.16,softLine(d+.015,.012)*.55));
 }else if(u_take<4.5){
  // A soft folded sheet, swept down. The hem flexes then lands flat.
  float curve=sin(st.x*PI+travel*.7)*.13*tension;
  float edge=travel*1.45-.22+curve;
  float d=st.y-edge;
  alpha=mix(1.-smoothstep(-.006,.006,d),smoothstep(-.006,.006,d),u_exit);
  float roll=exp(-abs(d+.035)*26.);
  float silk=.5+.5*cos((st.x-.35)*5.+st.y*2.);
  color=BG+vec3(.075,.041,.028)*roll+vec3(.018)*silk;
  color=mix(color,RED,softLine(d+.006,.006)*.70);
  // A single stationary fold ties the held sheet back to the travelling hem.
  color+=vec3(.030,.013,.007)*softLine(st.x-.77+.1*sin(st.y*2.),.045);
 }else{
  // A lens closes around the work, then opens with a generous release.
  vec2 center=(st-vec2(.50,.46))*vec2(aspect,1.);
  float distance=length(center);
  float radius=(1.-c)*1.45-.05;
  alpha=smoothstep(radius-.025,radius+.025,distance);
  float rim=softLine(distance-radius-.012,.016)*tension;
  float orbit=softLine(distance-.28-.006*sin(u_time*.8),.0018)*.22;
  float halo=exp(-pow((distance-.29)/.08,2.))*.08;
  color=mix(BG,RED,max(rim*.80,orbit+halo));
 }
 alpha=mix(alpha,0.,1.-smoothstep(0.,.008,c));
 alpha=mix(alpha,1.,smoothstep(.992,1.,c));
 gl_FragColor=vec4(color,alpha);
}
