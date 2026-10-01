#version 300 es
// One step of the water the ink sits in: velocity in .xy, how far the ink has
// been carried in .zw, both in CSS pixels. The hand adds velocity around the
// cursor with a slight curl; both fields are carried along by the velocity and
// settle on their own, the water quickly and the carried ink slowly.
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2 u_size;
uniform vec2 u_pointer;
uniform vec2 u_force;
uniform float u_radius;
uniform float u_dt;

void main() {
	vec2 velocity = texture(u_state, v_uv).xy;
	vec4 previous = texture(u_state, v_uv - velocity * u_dt / u_size);
	vec2 v = previous.xy * pow(.962, u_dt);
	vec2 carried = previous.zw * pow(.9965, u_dt);
	vec2 delta = v_uv * u_size - u_pointer;
	float reach = exp(-dot(delta, delta) / (u_radius * u_radius));
	float push = length(u_force);
	v += u_force * reach * 1.25;
	v += vec2(-delta.y, delta.x) / u_radius * push * reach * .28;
	v = clamp(v, vec2(-60.), vec2(60.));
	carried += v * u_dt * .65;
	carried = clamp(carried, vec2(-260.), vec2(260.));
	outColor = vec4(v, carried);
}
