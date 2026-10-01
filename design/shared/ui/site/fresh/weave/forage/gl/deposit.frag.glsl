#version 300 es
precision highp float;
uniform float u_deposit;
out vec4 outTrail;
void main() { outTrail = vec4(u_deposit, 0., 0., 0.); }
