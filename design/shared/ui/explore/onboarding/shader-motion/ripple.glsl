vec4 effect(vec2 uv,float p) {
 float e=ease(p),s=pulse(p);
 vec2 q=domain(uv,mix(u_from,u_to,e));
 vec2 origin=domain(uv,mix(u_from,u_to,.45));
 float r=length(origin),front=p*2.6;
 float wave=sin((r-front)*19.)*exp(-pow((r-front)*2.,2.))*s;
 vec2 displaced=q+origin/max(r,.001)*wave*.20;
 vec4 ink=field(displaced,envelope(displaced));
 float ring=exp(-pow((r-front)*30.,2.))*s*.18;
 return ink+vec4(vec3(.6,.14,.045)*ring*envelope(q),0.);
}
