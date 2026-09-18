export const modules = {
 welcome: { title: "Welcome to spool.", body: "A canvas for working things out. Design with your agent, then try what you make." },
 how: { title: "From an idea to something real.", body: "Ask your agent to make something. See it on the canvas, change it, and try it." },
 files: { title: "A place in your project.", body: "Your designs live in a design/ folder, alongside your code. Open the same folder in spool and your agent." },
 project: { title: "Where shall we start?", body: "Open a project you’re working on, or give a new idea a place of its own." },
 new: { title: "Give it a place.", body: "spool will keep your frames and shared pieces in this project’s design/ folder." },
 existing: { title: "Bring your project.", body: "Choose the folder you work in. spool can open its designs or add a design/ folder." },
 found: { title: "Pick up where you left off.", body: "There’s already a design/ folder here. Your frames are ready to open." },
 source: { title: "Start with something you have.", body: "Give your agent a design to recreate as live, editable frames." },
 reference: { title: "Give your agent a starting point.", body: "Add a link or a local file path. Your agent will need access to the source to recreate it." },
 import: { title: "An import starts with a prompt.", body: "Ask your agent to rebuild the design in your project. Review the first frame together, then keep going." },
 agent: { title: "Where do you like to work?", body: "Both work with the same project files. You can change your mind whenever you want." },
 connect: { title: "Bring an account.", body: "Connect ChatGPT or an API key to use the agent beside your canvas." },
 handoff: { title: "Meet you in your agent.", body: "Open this project folder in your usual agent. Paste the prompt below, and the frames it makes will appear in spool." },
 prompt: { title: "What should we make first?", body: "A rough idea is enough. Your agent can help you work out the details." },
 sample: { title: "Try a little project.", body: "Explore a small, working example before starting something of your own." },
 preview: { title: "Still taking shape.", body: "spool is before 1.0. Expect rough edges, changing details, and room for your ideas." },
 ownership: { title: "Make it yours.", body: "Your designs are ordinary files you can edit, keep in Git, and take with you. spool itself is open source, too." },
 basics: { title: "A little room to play.", body: "Arrange frames on the canvas. Open one to interact with it, or follow a flow from start to finish." },
 browser: { title: "Same project. Another window.", body: "The local browser canvas works with the same files as the desktop app. Open your project to keep going." },
 ready: { title: "Your project starts here.", body: "Open the canvas when you’re ready. You can set up your agent and change these choices there, too." },
} as const;
export type Module = keyof typeof modules;
export type Agent = "own" | "spool";
export type Project = "new" | "existing" | "import" | "sample";
export type Source = "Figma" | "Paper" | "Pen" | "Image";

export function stageFor(module: Module): number {
 if (module === "welcome") return 0;
 return ["files", "new", "existing", "found", "handoff", "import", "ready", "browser"].includes(module) ? 2 : 1;
}
