// Fixed canvas coordinates. Each point takes a slow breath; the lattice stays put.
void main() {
 vec2 st=uv(), px=st*u_size;
 vec2 cell=floor(px/19.); vec2 center=(cell+.5)*19.;
 vec2 p=plane(center/u_size);
 float breath=.5+.5*sin(length(p*vec2(.9,1.5))*7.-u_time*.65+1.2);
 float pocket=exp(-dot(p,p)*1.5);
 float influence=exp(-length((center/u_size-u_pointer)*vec2(u_size.x/u_size.y,1.))*6.)*u_active;
 float radius=.8+breath*1.25*pocket+influence*1.3;
 float dot=1.-smoothstep(radius,radius+.65,length(px-center));
 float warmth=smoothstep(.58,.95,breath)*pocket;
 finish(mix(ASH,RED,warmth*.9),dot*(.30+breath*.52+influence*.15));
}
