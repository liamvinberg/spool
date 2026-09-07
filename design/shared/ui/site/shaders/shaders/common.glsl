precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_active;
const float PI = 3.14159265359;
const vec3 RED = vec3(0.961, 0.224, 0.102);
const vec3 ASH = vec3(0.580, 0.569, 0.553);
const vec3 BG = vec3(0.0627451);
vec2 uv() { return vec2(v_uv.x, 1.0-v_uv.y); }
vec2 plane(vec2 st) { return (st-vec2(.76,.46))*vec2(u_size.x/u_size.y,1.); }
mat2 rot(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
 vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p) {
 float n=0.; float a=.5;
 for(int i=0;i<4;i++) { n+=a*noise(p); p=rot(.53)*p*2.03+3.7; a*=.5; }
 return n;
}
float stroke(float d, float width) { return 1.-smoothstep(width,width+1.1/u_size.y,abs(d)); }
float envelope(vec2 st) {
 return mix(.065,1.,smoothstep(.27,.72,st.x))*smoothstep(0.,.10,st.y)*(1.-smoothstep(.66,.98,st.y));
}
void finish(vec3 ink, float amount) {
 gl_FragColor=vec4(mix(BG,ink,clamp(amount*envelope(uv()),0.,1.)),1.);
}
