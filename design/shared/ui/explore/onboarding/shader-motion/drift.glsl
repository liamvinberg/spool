vec4 effect(vec2 uv,float p) {
 float s=pulse(p),e=ease(p);
 vec2 q=domain(uv,mix(u_from,u_to,e));
 // Wind advects irregular bands at different speeds, making long trailing wisps.
 float gust=noise(vec2(q.y*6.,e*2.));
 q.x+=(gust-.5)*s*2.8;
 q.y+=sin(q.x*3.5+e*4.)*s*.10;
 vec2 trail=vec2(q.x/(1.+s*1.1),q.y*(1.+s*.9));
 vec2 material=vec2(trail.x*(1.-s*.88),trail.y*(1.+s*2.));
 return field(material,envelope(trail)*(1.-s*.18));
}
