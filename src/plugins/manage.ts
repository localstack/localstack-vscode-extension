import { commands, window } from "vscode";

import { createPlugin } from "../plugins.ts";
import {
	openLicensePage,
	startLocalStack,
	stopLocalStack,
} from "../utils/manage.ts";

export default createPlugin(
	"manage",
	({
		context,
		outputChannel,
		telemetry,
		localStackStatusTracker,
		cliStatusTracker,
	}) => {
		context.subscriptions.push(
			commands.registerCommand("localstack.start", async () => {
				const cliPath = cliStatusTracker.cliPath();
				if (!cliPath) {
					void window.showInformationMessage(
						"LocalStack CLI could not be found. Please, run the setup wizard.",
					);
					return;
				}

				if (localStackStatusTracker.status() !== "stopped") {
					window.showInformationMessage("LocalStack is already running.");
					return;
				}
				localStackStatusTracker.forceContainerStatus("running");
				try {
					await startLocalStack(cliPath, outputChannel, telemetry);
				} catch {
					localStackStatusTracker.forceContainerStatus("stopped");
				}
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.stop", () => {
				const cliPath = cliStatusTracker.cliPath();
				if (!cliPath) {
					void window.showInformationMessage(
						"LocalStack CLI could not be found. Please, run the setup wizard.",
					);
					return;
				}

				if (localStackStatusTracker.status() !== "running") {
					window.showInformationMessage("LocalStack is not running.");
					return;
				}
				localStackStatusTracker.forceContainerStatus("stopping");
				void stopLocalStack(cliPath, outputChannel, telemetry);
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.openLicensePage", () => {
				void openLicensePage();
			}),
		);
	},
);
