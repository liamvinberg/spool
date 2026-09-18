vec4 effect(vec2 uv,float p) {
 // Coherent chunks erode before the finer dust appears at their edges.
 float n=fbm(uv*13.);
 float outgoing=1.-smoothstep(n-.095,n+.095,p*1.6);
 float incoming=smoothstep(n-.095,n+.095,(p-.30)*1.6);
 vec2 qa=domain(uv,u_from),qb=domain(uv,u_to);
 float swell=pulse(p);
 qa+=vec2(sin(qa.y*5.),cos(qa.x*5.))*swell*.12;
 vec4 a=field(qa,envelope(qa)*outgoing);
 vec4 b=field(qb,envelope(qb)*incoming);
 float edge=exp(-abs(n-p*1.6)*85.);
 float dust=step(.982,hash(floor(uv*u_size*.5)))*edge*envelope(qa)*swell;
 return layer(a,b)+vec4(vec3(.9,.21,.065)*dust,0.);
}
