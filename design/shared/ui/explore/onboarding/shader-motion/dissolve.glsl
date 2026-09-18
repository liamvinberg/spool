vec4 effect(vec2 uv,float p) {
 // The dissolve belongs to the pigment's density. Its own soft variations
 // loosen and regroup, with no second noise mask cutting holes through it.
 float e=ease(p),breath=pow(pulse(p),2.);
 vec2 q=domain(uv,mix(u_from,u_to,e));
 vec2 carried=q+vec2(.08,-.045)*breath;
 float value=pigment(carried);
 float density=smoothstep(.24+breath*.17,.74+breath*.12,value);
 float mask=envelope(q/(1.+breath*.18));
 float alpha=clamp(density*mask*1.4*(1.-breath*.12),0.,1.);
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28,.73,value));
 return vec4(ink*alpha,alpha);
}
