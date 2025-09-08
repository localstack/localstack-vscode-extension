import ms from "ms";
import { StatusBarAlignment, window } from "vscode";
import type { ExtensionContext } from "vscode";

import configureAws from "./plugins/configure-aws.ts";
import logs from "./plugins/logs.ts";
import manage from "./plugins/manage.ts";
import setup from "./plugins/setup.ts";
import statusBar from "./plugins/status-bar.ts";
import { PluginManager } from "./plugins.ts";
import { createContainerStatusTracker } from "./utils/container-status.ts";
import { createLocalStackStatusTracker } from "./utils/localstack-status.ts";
import { getOrCreateExtensionSessionId } from "./utils/manage.ts";
import { createSetupStatusTracker } from "./utils/setup-status.ts";
import { createTelemetry } from "./utils/telemetry.ts";
import { createTimeTracker } from "./utils/time-tracker.ts";

const plugins = new PluginManager([
	setup,
	configureAws,
	manage,
	statusBar,
	logs,
]);

export async function activate(context: ExtensionContext) {
	const outputChannel = window.createOutputChannel("LocalStack", {
		log: true,
	});
	context.subscriptions.push(outputChannel);

	const timeTracker = createTimeTracker({ outputChannel });

	const {
		containerStatusTracker,
		localStackStatusTracker,
		setupStatusTracker,
		statusBarItem,
		telemetry,
	} = await timeTracker.run("extension.dependencies", async () => {
		const statusBarItem = window.createStatusBarItem(
			StatusBarAlignment.Left,
			-1,
		);
		context.subscriptions.push(statusBarItem);
		statusBarItem.text = "$(loading~spin) LocalStack";
		statusBarItem.show();

		const containerStatusTracker = await createContainerStatusTracker(
			"localstack-main",
			outputChannel,
			timeTracker,
		);
		context.subscriptions.push(containerStatusTracker);

		const localStackStatusTracker = createLocalStackStatusTracker(
			containerStatusTracker,
			outputChannel,
			timeTracker,
		);
		context.subscriptions.push(localStackStatusTracker);

		outputChannel.trace(`[setup-status]: Starting...`);
		const startStatusTracker = Date.now();
		const setupStatusTracker = await createSetupStatusTracker(
			outputChannel,
			timeTracker,
		);
		context.subscriptions.push(setupStatusTracker);
		const endStatusTracker = Date.now();
		outputChannel.trace(
			`[setup-status]: Completed in ${ms(
				endStatusTracker - startStatusTracker,
				{ long: true },
			)}`,
		);

		const startTelemetry = Date.now();
		outputChannel.trace(`[telemetry]: Starting...`);
		const sessionId = await getOrCreateExtensionSessionId(context);
		const telemetry = createTelemetry(outputChannel, sessionId);
		const endTelemetry = Date.now();
		outputChannel.trace(
			`[telemetry]: Completed in ${ms(endTelemetry - startTelemetry, {
				long: true,
			})}`,
		);

		return {
			statusBarItem,
			containerStatusTracker,
			localStackStatusTracker,
			setupStatusTracker,
			telemetry,
		};
	});

	await timeTracker.run("extension.activatePlugins", async () => {
		await plugins.activate({
			context,
			outputChannel,
			statusBarItem,
			containerStatusTracker,
			localStackStatusTracker,
			setupStatusTracker,
			telemetry,
			timeTracker,
		});
	});
}

export async function deactivate() {
	await plugins.deactivate();
}
