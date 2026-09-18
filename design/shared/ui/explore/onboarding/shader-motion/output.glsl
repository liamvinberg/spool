void main() {
 vec2 uv=vec2(v_uv.x,1.-v_uv.y);
 float p=clamp(u_progress,0.,1.);
 vec4 ink;
 if(p<.0001) ink=base(uv,u_from);
 else if(p>.9999) ink=base(uv,u_to);
 else ink=effect(uv,p);
 // Grain stays attached to the paper, independently of the moving pigment.
 float grain=.79+hash(floor(uv*u_size))*.42;
 vec3 color=ink.rgb*grain+BG*(1.-clamp(ink.a,0.,1.));
 gl_FragColor=vec4(color,1.);
}
