precision highp float;
// The landing's pigment, read once per cell of the character grid rather than
// once per pixel. One texel per cell: r is the pigment, g is how much of it has
// gathered into the pool.
uniform vec2 u_cell;     // css px per cell
uniform vec2 u_size;     // css px
uniform float u_unit;    // css px per world unit at zoom 1
uniform vec3 u_cam;      // world x, world y, zoom
uniform float u_time;
uniform vec4 u_pool;     // world x, y, radius, strength

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
 // Texel rows run top down here, matching the grid texture.
 vec2 cell=floor(gl_FragCoord.xy);
 vec2 center=(cell+.5)*u_cell;
 float scale=u_unit*u_cam.z;
 vec2 w=(center-u_size*.5)/scale+u_cam.xy;
 float value=pigment(w*.9,u_time*.05);
 float d=length(w-u_pool.xy)/max(u_pool.z,.0001);
 float pool=(1.-smoothstep(.35,1.05,d+(value-.5)*.95))*u_pool.w;
 gl_FragColor=vec4(value,pool,0.,1.);
}
