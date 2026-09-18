vec4 effect(vec2 uv,float p) {
 float s=pulse(p),e=ease(p);
 vec2 center=mix(u_from,u_to,e)+vec2(0.,s*.17);
 vec2 q=domain(uv,center);
 // Each vertical lane falls a different distance; the material stretches with it.
 float lanes=noise(vec2(q.x*9.,4.2));
 float sag=s*(.12+lanes*.82);
 vec2 liquid=vec2(q.x*(1.+s*.18),(q.y-sag)/(1.+s*.85));
 float neck=mix(1.,smoothstep(.12,.48,lanes),s*.82);
 return field(liquid,envelope(liquid)*neck*(1.+s*.2));
}
