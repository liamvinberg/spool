import { CloudAccountChanged, type CloudRequestOptions, cloudOrigin, keychainVault, session } from "../cloud-auth";
export interface PublicationAuthOptions extends CloudRequestOptions {
	expectedPublisherId?: string;
}
/** A job may use only its admitted account, and a running operation may not follow a mutable vault. */
export async function publicationAuthority(spoolDir: string, options: PublicationAuthOptions) {
	const origin = options.origin ?? cloudOrigin(process.env);
	const vault = options.vault ?? keychainVault(spoolDir, origin);
	const token = await vault.read();
	const assertCurrent = async () => {
		if ((await vault.read()) !== token) throw new CloudAccountChanged();
	};
	const bound: CloudRequestOptions = {
		...options,
		origin,
		vault: {
			read: async () => {
				await assertCurrent();
				return token;
			},
		},
	};
	const account = await session(spoolDir, bound);
	if (options.expectedPublisherId !== undefined && account.publisherId !== options.expectedPublisherId)
		throw new CloudAccountChanged();
	return { options: bound, account, origin, assertCurrent };
}
