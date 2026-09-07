// Points describe an open orbital volume. Its density slowly precesses.
void main() {
 vec2 st=uv(); vec2 p=plane(st);
 p=rot(-.34+sin(u_time*.08)*.07)*p;
 p.y*=1.23;
 float d=length(p), a=atan(p.y,p.x);
 float t=u_time*.16;
 float shell=exp(-pow((d-.32-.045*sin(a*3.+t))*18.,2.));
 vec2 grid=vec2(a/6.28318*230.+sin(d*36.-t)*2.,d*230.+sin(a*4.+t)*2.);
 vec2 id=floor(grid), f=fract(grid)-.5;
 float point=1.-smoothstep(.16,.34,length(f));
 float density=.48+.52*hash(id);
 float front=.5+.5*sin(a+t+.8);
 vec3 ink=mix(ASH*1.35,RED,front);
 finish(ink,point*shell*density*(.8+front*.9));
}
