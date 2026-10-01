precision highp float;
varying vec2 v_uv;
// The landing's pigment, drawn in characters. Every cell of a monospace grid
// holds one character of TSX source; the pigment decides how much ink that
// character gets. The grid texture says what each cell is:
//   r  the character code
//   g  how strongly the scene asks for it (0 to 1)
//   b  what it is: 0 loose source, 1 source inside a frame or a shape,
//      2 a frame's edge, 3 a frame's name, 4 the hot walk, 5 printed text
//   a  the cursor's trail
uniform sampler2D u_grid;
uniform sampler2D u_atlas;
uniform sampler2D u_pigment; // per cell: r the pigment, g the pool (pigment.glsl)
uniform vec2 u_cells;    // columns, rows
uniform vec2 u_cell;     // css px per cell
uniform vec2 u_size;     // css px
uniform float u_cloud;   // loose source everywhere
uniform vec4 u_quiet;    // px box the copy sits in
uniform float u_quietness;

const vec3 BG = vec3(.0627451);
const vec3 RED = vec3(.961, .224, .102);
const float RAMP = 7.;   // ".,:;-=+" sit at atlas 0-6 after the printable ASCII

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float boxPx(vec2 px, vec4 b) {
 vec2 d=abs(px-b.xy-b.zw*.5)-b.zw*.5;
 return length(max(d,0.))+min(max(d.x,d.y),0.);
}
float glyph(float index, vec2 local) {
 vec2 slot=vec2(mod(index,16.),floor(index/16.));
 return texture2D(u_atlas,(slot+local)/vec2(16.,7.)).a;
}

void main() {
 vec2 px=vec2(v_uv.x,1.-v_uv.y)*u_size;
 vec2 cell=floor(px/u_cell);
 vec2 local=fract(px/u_cell);
 if(cell.x>=u_cells.x||cell.y>=u_cells.y){ gl_FragColor=vec4(BG,1.); return; }
 vec4 g=texture2D(u_grid,(cell+.5)/u_cells);
 float code=floor(g.r*255.+.5);
 float ask=g.g;
 float kind=floor(g.b*255.+.5);
 float trail=g.a;

 // One reading of the pigment per cell, so a character is lit evenly.
 vec2 center=(cell+.5)*u_cell;
 vec4 p=texture2D(u_pigment,(cell+.5)/u_cells);
 float value=p.r;
 float pool=p.g;
 float cloud=smoothstep(.36,.74,value);

 float ink=max(cloud*u_cloud,pool*(.46+cloud*1.2));
 if(kind>.5&&kind<1.5) ink=ask*(.42+.8*value);
 else ink+=trail*(.85+.5*value);
 float quiet=1.-smoothstep(-14.,120.,boxPx(center,u_quiet));
 float hush=1.-quiet*u_quietness;
 if(kind<1.5) ink*=hush;

 vec3 color=BG;
 if(kind<1.5) {
  // Thin ink reads as dust: the source gives way to a ramp of light marks.
  // Thin ink at the edge of a mass falls apart into dust; blanks in the source
  // only ever carry the two lightest marks, so the code keeps its shape.
  float index=code-32.;
  if(code<32.5) index=ink>.3&&ink<.62?95.+step(.46,ink):0.;
  else if(ink<.28) index=95.+floor(clamp(ink/.28,0.,.999)*RAMP);
  float a=glyph(index,local)*(code<32.5?.55:1.);
  vec3 tone=mix(vec3(.4,.07,.035),RED,smoothstep(.2,.7,ink));
  tone=mix(tone,vec3(1.,.62,.46),smoothstep(.95,1.4,ink+trail*.7));
  color=mix(BG,tone,a*smoothstep(.06,.2,ink));
 } else if(kind<2.5) {
  color=mix(BG,vec3(.74,.69,.65),glyph(code-32.,local)*ask);
 } else if(kind<3.5) {
  color=mix(BG,vec3(.6,.57,.53),glyph(code-32.,local)*ask);
 } else if(kind<4.5) {
  float index=code<32.5?95.+2.:code-32.;
  color=mix(BG,mix(RED,vec3(1.,.66,.5),ask*ask),glyph(index,local)*min(1.,ask*1.4));
 } else {
  color=mix(BG,vec3(.93,.9,.86),glyph(code-32.,local)*ask);
 }
 color+=(hash(px+.37)-.5)/255.;
 gl_FragColor=vec4(color,1.);
}
