// Procedural height and finite-difference normals make a red, liquid relief.
float relief(vec2 p) {
 float t=u_time*.075;
 vec2 q=p+vec2(sin(p.y*3.+t),cos(p.x*3.-t))*.16;
 return fbm(q*3.+vec2(t,-t*.7));
}
void main() {
 vec2 p=plane(uv());
 float h=relief(p), e=.003;
 vec2 grad=vec2(relief(p+vec2(e,0.))-h,relief(p+vec2(0.,e))-h)/e;
 vec3 normal=normalize(vec3(-grad*.7,1.));
 vec3 light=normalize(vec3(-.55,-.7,1.));
 float diffuse=max(0.,dot(normal,light));
 float spec=pow(max(0.,dot(reflect(-light,normal),vec3(0.,0.,1.))),24.);
 float body=smoothstep(.37,.48,h)*(1.-smoothstep(.47,.66,length(p*vec2(.85,1.35))));
 vec3 ink=RED*(.13+diffuse*.7)+vec3(1.,.78,.59)*spec*.75;
 finish(ink,body);
}
