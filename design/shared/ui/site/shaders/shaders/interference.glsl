// Two off-axis ring systems form a slowly revolving moire lens.
void main() {
 vec2 p=plane(uv());
 float t=u_time*.12;
 vec2 offset=vec2(cos(t+.6),sin(t+.6))*.055;
 float a=length(p-offset), b=length(p+offset);
 float wave1=.5+.5*cos(a*430.);
 float wave2=.5+.5*cos(b*430.);
 float lines=pow(wave1*wave2,.68);
 float disk=1.-smoothstep(.405,.414,length(p));
 float inner=smoothstep(.018,.10,length(p));
 float rim=stroke(length(p)-.413,.0008);
 finish(mix(RED,ASH,.12),max(lines*.78*disk*inner,rim*.35));
}
