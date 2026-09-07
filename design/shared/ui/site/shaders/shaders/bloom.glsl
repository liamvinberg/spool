// A grainy red pigment cloud circulates beneath the hero.
void main() {
 vec2 st=uv(), p=plane(st);
 float t=u_time*.065;
 vec2 drift=vec2(fbm(p*2.3+vec2(t,0.)),fbm(p*2.3+vec2(4.2,-t)))-.5;
 float pigment=fbm(p*3.+drift*3.+vec2(t,t*.4));
 float shape=exp(-dot((p+drift*.5)*vec2(.9,1.65),(p+drift*.5)*vec2(.9,1.65))*2.2);
 float smoke=smoothstep(.26,.74,pigment)*shape;
 float grain=hash(floor(st*u_size));
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.3,.72,pigment));
 finish(ink,smoke*(.66+grain*.45));
}
