// Parallel bands turn through an hourglass, borrowing the mark's winding silhouette.
void main() {
 vec2 p=plane(uv());
 p=rot(-.20)*p;
 float t=u_time*.2;
 p.x-=.035*sin(t+p.y*5.);
 float y=p.y*1.95;
 float width=.095+.35*pow(abs(sin(y*2.8)),1.3);
 float edge=1.-smoothstep(width,width+.004,abs(p.x));
 float ends=1.-smoothstep(.70,.85,abs(y));
 float twist=p.x/(width+.03);
 float band=y*19.+sin(t+y*2.)*.45+twist*.62;
 float strip=1.-smoothstep(.54,.61,fract(band));
 float light=.3+.7*pow(.5+.5*cos(twist*2.1-y*3.+t),2.);
 vec3 ink=mix(RED*.37,vec3(1.,.33,.15),light);
 finish(ink,edge*ends*strip);
}
