vec4 effect(vec2 uv,float p) {
 float e=ease(p),s=pulse(p);
 vec2 center=mix(u_from,u_to,e);
 vec2 q=domain(uv,center);
 // A dark body crosses the material while the next position forms behind it.
 vec2 shadowCenter=mix(u_from-vec2(.38,.10),u_to+vec2(.38,.10),e);
 vec2 shadow=(uv-shadowCenter)*vec2(u_size.x/u_size.y,1.);
 float edge=length(shadow)-s*.26;
 float visible=smoothstep(-.014,.022,edge);
 vec4 ink=field(q,envelope(q)*visible);
 float corona=exp(-abs(edge)*65.)*s*envelope(q);
 float wisp=.25+.75*fbm(q*7.);
 return ink+vec4(vec3(.76,.17,.04)*corona*wisp,0.);
}
