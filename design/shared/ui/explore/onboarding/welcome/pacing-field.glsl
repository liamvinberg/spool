precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform vec4 u_pose;
uniform vec2 u_bend;
uniform vec3 u_material;
uniform vec3 u_camera;
uniform float u_scene;

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
float scenePool(vec2 uv,vec2 center,vec2 radius) {
 vec2 q=(uv-center)/radius;
 return exp(-dot(q,q)*2.);
}
void main() {
 vec2 uv=vec2(v_uv.x,1.-v_uv.y),px=uv*u_size;
 float scale=clamp(u_size.x*.43,420.,700.);
 vec2 displacement=(u_pose.xy-vec2(.79,.39))*u_size;
 vec2 domain=(px-vec2(u_size.x*.76,320.)-displacement*u_material.z)/scale;
 domain=rot(u_bend.x)*domain/u_material.x+vec2(.6,-.35)*u_material.y;
 // Smooth, broad bending of the existing pigment, without changing its seed.
 domain+=vec2(sin(domain.y*2.1),sin(domain.x*1.7))*u_bend.y;
 vec2 q=rot(u_bend.x)*((uv-u_pose.xy)*vec2(u_size.x/u_size.y,1.));
 q/=u_pose.zw*vec2(u_size.x/u_size.y,1.);
 float pool=exp(-dot(q,q)*2.);
 if(u_scene>.5) {
  // One larger, fixed scene. Only the camera changes between steps.
  // The other pools already exist beyond the visible right and lower edges.
  vec2 world=(uv-vec2(.75,.4))/u_camera.z+vec2(.75,.4)+u_camera.xy;
  vec2 worldPx=world*u_size;
  domain=(worldPx-vec2(u_size.x*.76,320.))/scale;
  float a=scenePool(world,vec2(.79,.39),vec2(.40,.43));
  float b=scenePool(world,vec2(1.38,.70),vec2(.42,.55))*.94;
  float c=scenePool(world,vec2(.95,1.20),vec2(.45,.45))*.90;
  float d=scenePool(world,vec2(1.52,1.40),vec2(.42,.50))*.86;
  pool=1.-(1.-a)*(1.-b)*(1.-c)*(1.-d);
  // A quiet foreground under the copy, independent of the moving scene.
  pool*=mix(.3,1.,smoothstep(.18,.60,uv.x));
  px=worldPx;
 }
 float value=pigment(domain,u_time*.048);
 float grain=hash(floor(px));
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 float opacity=clamp(smoothstep(.255,.735,value)*pool*1.03*(.67+grain*.44),0.,1.);
 gl_FragColor=vec4(mix(BG,ink,opacity),1.);
}
