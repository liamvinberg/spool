/**
 * A person as spool shows them to anyone else: the name their account gave, or until it gives one, their address
 * before the @. Every surface names people through this one rule, so one person never shows two ways. spool.page
 * sends names already decided; the rule stands in for an older spool.page that sent only the address, and for an
 * invitee, who has only an address.
 */
export function personName(person: { name?: string | null | undefined; email: string }): string {
	return person.name || person.email.split("@")[0] || person.email;
}
