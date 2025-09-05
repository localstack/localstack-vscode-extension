import type { LogOutputChannel } from "vscode";

import { checkIsAuthenticated } from "./authenticate.ts";
import { checkIsProfileConfigured } from "./configure-aws.ts";
import { checkLocalstackInstalled } from "./install.ts";
import { checkIsLicenseValid } from "./license.ts";

export async function checkSetupStatus(outputChannel: LogOutputChannel) {
	const [isInstalled, isAuthenticated, isLicenseValid, isProfileConfigured] =
		await Promise.all([
			checkLocalstackInstalled(outputChannel),
			checkIsAuthenticated(),
			checkIsLicenseValid(outputChannel),
			checkIsProfileConfigured(),
		]);

	return {
		isInstalled,
		isAuthenticated,
		isLicenseValid,
		isProfileConfigured,
	};
}
