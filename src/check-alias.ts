import { CheckSourceLimitError, checkSourceLimits } from "./check-budget";

export type CheckerAliasConsumer = "module" | "jsx" | "css" | "ambient" | "require";
export type CheckerAliasForm = "module" | "identifier";

const moduleAliasCharacters: string[] = [];
for (let code = 0xe001; code <= 0xf8ff; code += 1) moduleAliasCharacters.push(String.fromCharCode(code));
const identifierAliasCharacters: string[] = [];
for (let code = 0x4e00; code <= 0x9fff; code += 1) identifierAliasCharacters.push(String.fromCharCode(code));
export const checkerAliasCapacity = Math.min(moduleAliasCharacters.length, identifierAliasCharacters.length);

export class CheckerAliasAllocator {
	#allocated = 0;
	readonly #next = { module: 0, identifier: 0 };
	readonly #reserved = { module: new Set<string>(), identifier: new Set<string>() };

	constructor(private readonly limit = checkSourceLimits.maxAliases) {
		if (!Number.isInteger(limit) || limit < 0 || limit > checkerAliasCapacity) {
			throw new Error("checker alias budget exceeds its injective alphabet");
		}
	}

	reserve(form: CheckerAliasForm, authored: string): void {
		if (this.#allocated > 0) throw new Error("checker aliases must be reserved before allocation");
		for (let index = 0; index < authored.length; index += 1) {
			const character = authored[index];
			if (character !== undefined) this.#reserved[form].add(character);
		}
	}

	allocate(_consumer: CheckerAliasConsumer, file: string, length: number, form: CheckerAliasForm = "module"): string {
		if (!Number.isInteger(length) || length < 1)
			throw new Error("checker aliases must contain at least one code unit");
		if (this.#allocated >= this.limit) throw new CheckSourceLimitError(file);
		const characters = form === "module" ? moduleAliasCharacters : identifierAliasCharacters;
		let candidate = this.#next[form];
		while (this.#reserved[form].has(characters[candidate] ?? "")) candidate += 1;
		const head = characters[candidate];
		if (head === undefined) throw new CheckSourceLimitError(file);
		this.#next[form] = candidate + 1;
		this.#allocated += 1;
		return `${head}${characters[0]?.repeat(length - 1)}`;
	}
}
