// A graphite mesh lifted into soft folds, with one warm seam.
void main() {
 vec2 p=plane(uv());
 p=rot(-.32)*p;
 float t=u_time*.14;
 float fold=sin(p.x*5.+t)*.13+sin(p.x*10.-t)*.035;
 vec2 q=vec2(p.x,p.y+fold);
 float a=abs(sin(q.y*225.));
 float b=abs(sin((q.x+.04*sin(q.y*7.+t))*205.));
 float lines=max(1.-smoothstep(.1,.31,a),(1.-smoothstep(.09,.27,b))*.7);
 float light=pow(.5+.5*cos(p.x*5.+t-.9),3.);
 float cut=(1.-smoothstep(.36,.49,abs(q.y)))*(1.-smoothstep(.63,.81,abs(q.x)));
 float seam=stroke(q.y-.13,.0016);
 vec3 ink=mix(ASH*.5,vec3(.91,.88,.82),light);
 finish(mix(ink,RED,seam),max(lines*(.26+light*.62),seam*.85)*cut);
}
