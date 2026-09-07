// A regular field is carried sideways by a slow noise current.
void main() {
 vec2 st=uv(); vec2 p=plane(st);
 vec2 q=p;
 float t=u_time*.075;
 q.x+=.17*sin(p.y*6.+t*2.)+.075*sin(p.y*15.-t);
 q.y+=.095*sin(p.x*5.-t*1.7)+.06*noise(p*4.+t);
 vec2 pointer=plane(u_pointer);
 q+=(p-pointer)*exp(-length(p-pointer)*6.)*u_active*.16;
 vec2 grid=q*vec2(72.,59.);
 vec2 id=floor(grid), f=fract(grid)-.5;
 float n=fbm(id*.026+vec2(t,0.));
 float radius=.07+n*.095;
 float point=1.-smoothstep(radius,radius+.065,length(f));
 float band=.5+.5*sin(q.y*17.+q.x*4.+n*7.);
 finish(mix(ASH,RED,smoothstep(.3,.75,n)),point*(.22+band*.68)*exp(-dot(p,p)*.7));
}
