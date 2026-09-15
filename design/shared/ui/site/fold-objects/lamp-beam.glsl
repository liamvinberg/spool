precision mediump float;
varying vec2 v_uv;
uniform float u_time;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
  float depth = clamp((p.y - .195) / .71, 0.0, 1.0);
  float width = mix(.17, .30, depth);
  float edge = exp(-pow(abs((p.x - .59) / width), 4.0) * 2.0);
  float ends = smoothstep(.185, .235, p.y) * (1.0 - smoothstep(.86, .95, p.y));
  float beam = edge * ends * mix(.21, .055, depth);
  vec2 floorPoint = (p - vec2(.59, .905)) / vec2(.29, .052);
  float pool = exp(-dot(floorPoint, floorPoint) * 2.0) * .38;
  float dust = 0.0;
  for (int i = 0; i < 16; i++) {
    float n = float(i) + 1.0;
    vec2 particle = vec2(.35 + hash(n) * .48, .22 + fract(hash(n + 21.0) + u_time * .016) * .65);
    particle.x += sin(u_time * .22 + n) * .008;
    vec2 d = (p - particle) / .0013;
    dust += exp(-dot(d,d) * 2.0) * .15;
  }
  float alpha = clamp(beam + pool + dust * edge * ends, 0.0, .55);
  // Premultiplied alpha lets the browser composite the light onto the scene.
  gl_FragColor = vec4(vec3(1.0, .76, .42) * alpha, alpha);
}
