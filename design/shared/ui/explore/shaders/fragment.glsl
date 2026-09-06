precision highp float;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float time;
void main() {
  vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 2.0;
  p -= vec2(0.62, 0.02) + (pointer - 0.5) * 0.24;
  vec2 q = mat2(0.88, 0.475, -0.475, 0.88) * p;
  q *= vec2(0.88, 1.18);
  float a = atan(q.y, q.x);
  float r = length(q);
  float ring = 0.63 + 0.055 * sin(a * 3.0 + time * 0.45) + 0.022 * cos(a * 7.0 - time * 0.22);
  float d = r - ring;
  float envelope = exp(-d * d * 95.0);
  float strands = pow(0.5 + 0.5 * sin(d * 230.0 + sin(a * 8.0 + time * 0.3) * 2.0), 9.0);
  vec3 spectrum = 0.5 + 0.5 * cos(6.283185 * (vec3(0.06, 0.28, 0.52) + a * 0.16 + r * 0.4 + time * 0.015));
  float glint = pow(0.5 + 0.5 * sin(a * 2.0 - time * 0.25), 12.0);
  vec3 col = vec3(0.031, 0.035, 0.047);
  col += spectrum * envelope * (0.25 + strands * 1.3);
  col += vec3(1.0, 0.91, 0.77) * envelope * strands * glint * 0.65;
  col += spectrum * exp(-d * d * 12.0) * 0.055;
  gl_FragColor = vec4(col, 1.0);
}
