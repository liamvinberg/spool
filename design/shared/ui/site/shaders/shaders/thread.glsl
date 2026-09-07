// One flowing vermilion thread doubles back into a loose coil.
void main() {
 vec2 p=plane(uv());
 p=rot(-.22)*p;
 float t=u_time*.25;
 float ink=0., glow=0.;
 for(int i=0;i<7;i++) {
  float j=float(i);
  float x=(j-3.)*.074;
  float bend=.29*sin(p.y*6.7+t+j*.10)+.07*sin(p.y*12.-t*.5);
  float d=p.x-x-bend;
  float end=1.-smoothstep(.28,.49,abs(p.y));
  float thread=stroke(d,.0012)*end;
  ink=max(ink,thread*(.45+.55*sin(j*.3+1.)));
  glow+=exp(-abs(d)*115.)*.034*end;
 }
 finish(mix(RED,vec3(1.,.47,.27),.16),ink*.95+glow);
}
