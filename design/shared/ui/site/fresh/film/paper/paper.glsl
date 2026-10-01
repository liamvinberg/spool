precision highp float;
varying vec2 v_uv;
// The pigment as ink on paper. Everything lives in sheet pixels: one long
// sheet the camera tracks along, where every mark stays once it has landed.
uniform vec2 u_size;      // css px
uniform vec3 u_view;      // screen = sheet * scale + offset: offset x, offset y, scale
uniform vec2 u_sheet;     // sheet width, height in sheet px
uniform float u_panel;    // one panel's width in sheet px
uniform float u_board;    // panel rules showing as the sheet pulls back
uniform vec4 u_drops[6];  // sheet x, y, radius, amount
uniform vec4 u_washes[4]; // sheet x, y, width, height
uniform vec4 u_washAmt;
uniform float u_time;

const vec3 PAPER = vec3(.953, .933, .894);
const vec3 DESK = vec3(.86, .83, .78);
const vec3 BODY = vec3(.96, .22, .095);
const vec3 EDGE = vec3(.5, .06, .035);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float noise(vec2 p) {
 vec2 i = floor(p), f = fract(p);
 f = f*f*(3.-2.*f);
 return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+1.), f.x), f.y);
}
float fbm(vec2 p) {
 float n=0., a=.5;
 for(int i=0; i<4; i++) { n+=a*noise(p); p=rot(.53)*p*2.03+3.7; a*=.5; }
 return n;
}
float box(vec2 p, vec2 hs) {
 vec2 d=abs(p)-hs;
 return length(max(d,0.))+min(max(d.x,d.y),0.);
}

// Marbling inside a bloom, the same folded noise the dark field is made of.
float marble(vec2 q) {
 vec2 warp=vec2(fbm(q*2.2),fbm(q*2.2+vec2(4.2,1.3)))-.5;
 return fbm(q*1.7+warp*2.4);
}

// One bloom of ink: a body that marbles and granulates, a thin dark tide line
// where it dried, and a pale feather of water running ahead along the fibres.
void drop(vec2 p, vec4 d, float fibres, float s, inout float density, inout float ring) {
 if (d.w <= .001 || d.z <= .5) return;
 vec2 q=(p-d.xy)/d.z;
 vec2 seed=d.xy*.0137;
 float n=fbm(q*1.9+seed)-.5;
 float fine=fbm(q*7.+seed*2.)-.5;
 float r=length(q)+n*.5+fine*.1+fibres*.05;
 float e=1.6/(d.z*s);
 float body=1.-smoothstep(1.-e,1.+e,r);
 float tide=pow(smoothstep(.8,1.,r),2.)*body;
 float feather=(1.-smoothstep(1.,1.22+fine*.5,r+fibres*.09))*(1.-body);
 float m=marble(q*1.3+seed);
 float grain=noise(p*.42)-.5;
 float ink=body*(.58+.6*m+grain*.1)+feather*.12;
 density=max(density,ink*d.w);
 ring=max(ring,tide*d.w);
}

void wash(vec2 p, vec4 b, float amount, float fibres, float s, inout float density, inout float ring) {
 if (amount <= .001) return;
 vec2 c=b.xy+b.zw*.5;
 float size=min(b.z,b.w);
 vec2 q=(p-c)/size;
 float n=fbm(q*3.+b.xy*.01)-.5;
 float fine=fbm(q*9.+b.xy*.02)-.5;
 // Laid from the top down, overrunning the ruling a little where the brush was wet.
 float front=(p.y-b.y)/b.w-amount*1.12+n*.22+fine*.05;
 float filled=1.-smoothstep(-.012,.012,front);
 float sd=box(p-c,b.zw*.5)/size+n*.05+fine*.025+fibres*.01;
 float e=1.4/(size*s);
 float body=(1.-smoothstep(-e,e,sd))*filled;
 float tide=pow(smoothstep(-.06,0.,sd),2.)*body+pow(1.-smoothstep(0.,.05,abs(front)),3.)*body*.6;
 float m=marble(q*1.1+b.xy*.003);
 float grain=noise(p*.42)-.5;
 density=max(density,body*(.52+.52*m+grain*.1));
 ring=max(ring,tide*.85);
}

void main() {
 vec2 px=vec2(v_uv.x,1.-v_uv.y)*u_size;
 float s=u_view.z;
 vec2 p=(px-u_view.xy)/s;
 float onSheet=step(0.,p.x)*step(p.x,u_sheet.x)*step(0.,p.y)*step(p.y,u_sheet.y);

 // Paper: a slow mottle, fibres along the grain, and tooth. Fine detail fades as the sheet shrinks.
 float detail=smoothstep(.25,.7,s);
 float mottle=fbm(p*.0035)-.5;
 float fibre=noise(p*vec2(.07,.22)+fbm(p*.01)*4.)-.5;
 float tooth=hash(floor(px))-.5;
 vec3 paper=PAPER*(1.+mottle*.035+fibre*.018*detail+tooth*.02);

 float fibres=noise(p*vec2(.045,.11)+fbm(p*.008)*3.+u_time*.01)-.5;
 float density=0., ring=0.;
 for(int i=0;i<6;i++) drop(p,u_drops[i],fibres,s,density,ring);
 wash(p,u_washes[0],u_washAmt.x,fibres,s,density,ring);
 wash(p,u_washes[1],u_washAmt.y,fibres,s,density,ring);
 wash(p,u_washes[2],u_washAmt.z,fibres,s,density,ring);
 wash(p,u_washes[3],u_washAmt.w,fibres,s,density,ring);
 density=clamp(density,0.,1.);
 vec3 tint=mix(BODY,EDGE,clamp(ring,0.,1.));
 // Subtractive: ink takes light away from the paper rather than sitting on it.
 vec3 color=paper*mix(vec3(1.),tint,density*(.9+tooth*.08));

 // The storyboard's panel rules, a screen pixel wide, as the sheet pulls back.
 float panelX=mod(p.x,u_panel);
 float rule=1.-smoothstep(.0,1.,min(panelX,u_panel-panelX)*s);
 color=mix(color,vec3(.55,.5,.45),rule*u_board*step(1.,p.x)*step(p.x,u_sheet.x-1.)*.55);

 vec3 desk=DESK*(1.+tooth*.015+mottle*.02);
 // The sheet's edge, crisp at any scale.
 vec2 inside=min(p,u_sheet-p)*s;
 float edge=1.-smoothstep(0.,1.,min(inside.x,inside.y));
 color=mix(desk,color,onSheet);
 color=mix(color,vec3(.62,.58,.53),edge*onSheet*u_board);
 color+=(hash(px+.61)-.5)/255.;
 gl_FragColor=vec4(color,1.);
}
