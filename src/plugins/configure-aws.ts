import { commands } from "vscode";

import { createPlugin } from "../plugins.ts";
import { configureAwsProfiles } from "../utils/configure-aws.ts";

export default createPlugin(({ context, telemetry }) => {
	context.subscriptions.push(
		commands.registerCommand("localstack.configureAwsProfiles", async () => {
			await configureAwsProfiles({
				telemetry: telemetry,
				notifyNoChangesMade: true,
			});
		}),
	);
});
