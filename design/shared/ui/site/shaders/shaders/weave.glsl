// Two continuous sets of threads cross without moving the page beneath them.
void main() {
 vec2 p=plane(uv());
 p=rot(-.22)*p;
 float t=u_time*.15;
 float bend=sin(p.x*3.8+t)*.11+sin(p.y*4.5-t)*.075;
 float a=abs(sin((p.y+bend)*168.));
 float b=abs(sin((p.x-bend*.8)*142.));
 float warp=1.-smoothstep(.09,.24,a);
 float weft=1.-smoothstep(.08,.22,b);
 float lens=exp(-dot(p*vec2(.75,1.5),p*vec2(.75,1.5))*2.);
 float hot=.5+.5*sin(p.x*3.-p.y*4.+t);
 finish(mix(ASH*.8,RED,hot*.72),max(warp*.55,weft*.34)*lens);
}
