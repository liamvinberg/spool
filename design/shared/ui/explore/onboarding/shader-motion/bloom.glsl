vec4 effect(vec2 uv,float p) {
 vec2 qa=domain(uv,u_from),qb=domain(uv,u_to);
 float uneven=fbm(qb*5.)*.55;
 float front=length(qb)+uneven;
 float reach=p*2.7-.3;
 float wet=1.-smoothstep(reach-.12,reach+.16,front);
 float rim=exp(-abs(front-reach)*32.)*pulse(p);
 vec4 outgoing=field(qa,envelope(qa)*(1.-ease(p)));
 vec4 incoming=field(qb,envelope(qb)*wet);
 // A saturated capillary edge travels outwards through the dry paper.
 return layer(incoming,outgoing)+vec4(vec3(.38,.055,.015)*rim*envelope(qb),0.);
}
