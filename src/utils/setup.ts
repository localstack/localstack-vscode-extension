import type { LogOutputChannel } from "vscode";

import { checkIsAuthenticated } from "./authenticate.ts";
import { checkIsProfileConfigured } from "./configure-aws.ts";
import { checkLocalstackInstalled } from "./install.ts";

export async function checkIsSetupRequired(
	outputChannel: LogOutputChannel,
): Promise<boolean> {
	const [isInstalled, isAuthenticated, isProfileConfigured] = await Promise.all(
		[
			checkLocalstackInstalled(outputChannel),
			checkIsAuthenticated(),
			checkIsProfileConfigured(),
		],
	);

	return !isInstalled || !isAuthenticated || !isProfileConfigured;
}
