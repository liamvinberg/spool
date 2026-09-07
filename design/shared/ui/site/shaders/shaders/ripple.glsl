// Circular impulses light a rigid dot grid. Moving the cursor makes a second source.
void main() {
 vec2 st=uv(), px=st*u_size;
 vec2 cell=floor(px/12.); vec2 center=(cell+.5)*12.;
 vec2 p=plane(center/u_size);
 float d=length(p*vec2(1.,1.08));
 float wave=pow(.5+.5*cos(d*48.-u_time*1.55),12.);
 float touch=length((center/u_size-u_pointer)*vec2(u_size.x/u_size.y,1.));
 wave=max(wave,pow(.5+.5*cos(touch*52.-u_time*2.),18.)*u_active*.85);
 float radius=.65+wave*1.6;
 float dot=1.-smoothstep(radius,radius+.6,length(px-center));
 finish(mix(ASH*.65,RED,wave),dot*(.19+wave*.78)*exp(-d*.55));
}
