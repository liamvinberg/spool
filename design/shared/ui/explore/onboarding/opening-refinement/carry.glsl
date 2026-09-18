precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform float u_carry;
uniform float u_press;

// spool.page's pigment, kept in document coordinates the way the site keeps it.
// The material never re-poses. Continuing travels the viewport across one
// standing field, so the same cloud that was behind the mark is the cloud that
// arrives on the right.
const vec3 BG = vec3(.0667, .0627, .0588);
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
float pool(vec2 px, vec2 center, vec2 radius) {
 vec2 d=(px-center)/radius;
 return exp(-dot(d,d)*2.);
}
void main() {
 vec2 st=vec2(v_uv.x,1.-v_uv.y);
 vec2 screen=st*u_size;
 // One travel vector carries every step. Nothing else about the field moves.
 vec2 origin=u_carry*vec2(u_size.x*.42,u_size.y*.10);
 vec2 px=screen+origin;

 float scale=clamp(u_size.x*.43,340.,700.);
 vec2 p=(px-vec2(u_size.x*.62,u_size.y*.30))/scale;
 // The press quickens the material itself, so a click reads before it travels.
 float value=pigment(p,u_time*.048+u_press*.075);
 float cloud=smoothstep(.255,.735,value);

 float near=pool(px,vec2(.52,.15)*u_size,vec2(.25,.27)*u_size);
 float mid=pool(px,vec2(1.24,.50)*u_size,vec2(.34,.40)*u_size);
 float far=pool(px,vec2(1.76,.44)*u_size,vec2(.44,.50)*u_size);
 float amount=cloud*max(near,max(mid,far*1.02))*.9;

 // Legibility is held once, in screen space, so no hollow opens or closes.
 vec2 q=(screen-vec2(.48,.49)*u_size)/(vec2(.39,.45)*u_size);
 amount*=1.-exp(-dot(q,q)*2.)*.58;
 amount*=smoothstep(10.,115.,screen.y);
 amount*=1.+u_press*.13;

 float grain=hash(floor(screen));
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 float opacity=clamp(amount*(.67+grain*.44),0.,1.);
 gl_FragColor=vec4(mix(BG,ink,opacity),1.);
}
