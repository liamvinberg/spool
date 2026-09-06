/** The accepted design-question specimen, carried by the deterministic provider. */
export const orderQuestion = {
	header: "Order number",
	question: "Where should the order number go?",
	options: [
		{ label: "Under the confirmation", description: "Keep the receipt centered." },
		{ label: "Beside the total", description: "Group the order details together." },
	],
};
export const askOrder = { name: "ask_person", arguments: { questions: [orderQuestion] } };
