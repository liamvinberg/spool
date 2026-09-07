// Topographic lines drift as one slowly changing surface.
void main() {
 vec2 p=plane(uv());
 float t=u_time*.055;
 vec2 pointer=plane(u_pointer);
 p+=.04*u_active*exp(-length(p-pointer)*4.);
 float field=fbm(p*2.2+vec2(t,-t*.6));
 field+=.1*sin(p.x*3.-p.y*2.+t);
 float levels=field*26.;
 float contour=1.-smoothstep(.027,.067,abs(fract(levels)-.5));
 float major=1.-smoothstep(.03,.07,abs(fract(levels/4.)-.5));
 float glow=exp(-dot(p,p)*1.2);
 finish(mix(RED*.56,RED,major),max(contour*.76,major*.72)*glow);
}
