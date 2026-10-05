precision mediump float;
uniform float time;
void main() {
	gl_FragColor = vec4(0.5 + 0.5 * sin(time), 0.2, 0.4, 1.0);
}
