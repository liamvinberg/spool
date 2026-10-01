#version 300 es
precision highp float;
// One point per walker, read straight from the agent texture.
uniform sampler2D u_agents;
uniform vec2 u_res;
uniform int u_side;
uniform float u_awake; // the share of walkers laying trail, 0 to 1
void main() {
	vec4 agent = texelFetch(u_agents, ivec2(gl_VertexID % u_side, gl_VertexID / u_side), 0);
	// Seeds run 0 to 100; the dormant ones lay nothing.
	gl_Position = agent.w < u_awake * 100. ? vec4(agent.xy / u_res * 2. - 1., 0., 1.) : vec4(2., 2., 0., 1.);
	gl_PointSize = 1.;
}
