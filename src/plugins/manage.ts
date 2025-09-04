import { commands } from "vscode";

import { createPlugin } from "../plugins.ts";
import {
	openLicensePage,
	startLocalStack,
	stopLocalStack,
} from "../utils/manage.ts";

export default createPlugin(
	"manage",
	({ context, outputChannel, telemetry }) => {
		context.subscriptions.push(
			commands.registerCommand("localstack.viewLogs", () => {
				outputChannel.show(true);
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.start", () => {
				void startLocalStack(outputChannel, telemetry);
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.stop", () => {
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
