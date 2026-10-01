precision highp float;
varying vec2 v_uv;
// The pigment as the walls of a well. The camera falls toward a red core at
// the bottom; as it falls the walls stream outward past it, and at the end
// the core opens and fills the frame.
uniform vec2 u_size;    // css px
uniform vec2 u_center;  // the vanishing point, px
uniform float u_depth;  // how far the camera has fallen, in layers
uniform float u_core;   // 0 a distant point of light, 1 the whole frame
uniform float u_time;

const vec3 BG = vec3(.047, .043, .043);
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
 vec2 px=vec2(v_uv.x,1.-v_uv.y)*u_size;
 float side=min(u_size.x,u_size.y);
 vec2 p=(px-u_center)/side;
 float r=length(p);
 float t=u_time*.035;

 // Tunnel coordinates: around the wall, and down it. Depth scrolls the wall past the camera.
 vec2 around=p/(r+.0001);
 float down=.42/(r+.04)+u_depth*.9;
 vec2 wall=around*1.25+vec2(down*.55,down*.22);
 float value=pigment(wall,t);
 float cloud=smoothstep(.28,.76,value);

 // The walls are lit by the core, so they brighten toward the middle and fall to black at the rim.
 float lit=exp(-r*mix(2.6,1.1,u_core))*(1.-smoothstep(.15,1.,r)*.55);
 float amount=cloud*lit*(.75+.4*u_core);
 float c=mix(.075,1.4,u_core*u_core);
 float core=exp(-r*r/(c*c));
 amount=max(amount,core*(.85+.2*cloud));
 amount=mix(amount,.6+cloud*.35,smoothstep(.75,1.,u_core));

 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 ink=mix(ink,vec3(1.,.5,.32),core*(1.-u_core)*.85);
 float grain=hash(floor(px));
 vec3 color=mix(BG,ink,clamp(amount*(.72+grain*.36),0.,1.));
 color+=(hash(px+.37)-.5)/255.;
 gl_FragColor=vec4(color,1.);
}
