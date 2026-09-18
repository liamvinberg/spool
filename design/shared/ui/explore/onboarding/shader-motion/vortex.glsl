vec4 effect(vec2 uv,float p) {
 float s=pulse(p),e=ease(p);
 vec2 q=domain(uv,mix(u_from,u_to,e));
 float radius=length(q);
 float angle=atan(q.y,q.x)+s*5.8*exp(-radius*.75);
 float pinch=1.-s*.63;
 vec2 wound=vec2(cos(angle),sin(angle))*radius/pinch;
 float spiral=.7+.3*sin(radius*19.-angle*2.+e*8.);
 return field(wound,envelope(wound)*mix(1.,spiral,s)*(1.+s*.6));
}
