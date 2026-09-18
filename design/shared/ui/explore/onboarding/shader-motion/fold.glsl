vec4 effect(vec2 uv,float p) {
 float e=ease(p),s=pulse(p);
 vec2 q=domain(uv,mix(u_from,u_to,e));
 q=rot(s*.55)*q;
 // Compress to a diagonal seam; the far half rolls underneath the near half.
 float width=max(.09,abs(cos(PI*p)));
 vec2 paper=vec2(q.x/width,q.y+sin(q.x*3.)*s*.28);
 paper.x=mix(paper.x,abs(paper.x)-.42,s);
 float crease=exp(-abs(q.x)*26.)*s;
 vec4 ink=field(paper,envelope(paper));
 return ink+vec4(vec3(.34,.065,.022)*crease*exp(-q.y*q.y*2.),0.);
}
