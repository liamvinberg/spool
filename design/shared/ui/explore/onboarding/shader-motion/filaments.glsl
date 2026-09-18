vec4 effect(vec2 uv,float p) {
 float e=ease(p),s=pow(pulse(p),1.4);
 vec2 q=domain(uv,mix(u_from,u_to,e));
 // Pull the pigment into bent, separated strands, then release their tension.
 float bend=sin(q.x*2.6+e*3.0)*s*.52;
 vec2 pulled=vec2(q.x/(1.+s*.65),(q.y+bend)*(1.+s*.5));
 float strands=pow(.5+.5*sin((pulled.y+.035*noise(q*3.))*92.),10.);
 float mask=mix(1.,strands,s*.96);
 vec2 material=vec2(pulled.x*(1.-s*.8),pulled.y*(1.+s*1.8));
 return field(material,envelope(pulled)*mask*(1.+s*.75));
}
