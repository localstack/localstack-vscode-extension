import { commands, window } from "vscode";

import { createPlugin } from "../plugins.ts";
import {
	openLicensePage,
	startLocalStack,
	stopLocalStack,
} from "../utils/manage.ts";

export default createPlugin(
	"manage",
	({ context, outputChannel, telemetry, localStackStatusTracker }) => {
		context.subscriptions.push(
			commands.registerCommand("localstack.viewLogs", () => {
				outputChannel.show(true);
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.start", () => {
				if (localStackStatusTracker.status() !== "stopped") {
					window.showInformationMessage("LocalStack is already running.");
					return;
				}
				localStackStatusTracker.forceStarting();
				void startLocalStack(outputChannel, telemetry);
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.stop", () => {
				if (localStackStatusTracker.status() !== "running") {
					window.showInformationMessage("LocalStack is not running.");
					return;
				}
				localStackStatusTracker.forceStopping();
				void stopLocalStack(outputChannel, telemetry);
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.openLicensePage", () => {
				void openLicensePage();
			}),
		);
	},
);
