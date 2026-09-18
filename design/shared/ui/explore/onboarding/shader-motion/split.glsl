vec4 effect(vec2 uv,float p) {
 float e=ease(p),s=pulse(p);
 vec2 q=domain(uv,mix(u_from,u_to,e));
 // A single soft body separates into three lobes following different arcs.
 vec2 a=vec2(-.62,-.34)*s,b=vec2(.57,-.24)*s,c=vec2(.10,.66)*s;
 float narrow=1.+s*1.45;
 float da=dot(q-a,q-a),db=dot(q-b,q-b),dc=dot(q-c,q-c);
 float mask=exp(-min(da,min(db,dc))*1.65*narrow*narrow);
 vec2 offset=da<db && da<dc ? a : db<dc ? b : c;
 vec2 sampled=mix(q,(q-offset)*narrow,s);
 return field(sampled,mask*(1.+s*.4));
}
