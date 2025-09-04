import { StatusBarAlignment, window } from "vscode";
import type { ExtensionContext } from "vscode";

import authenticate from "./plugins/authenticate.ts";
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

const plugins = new PluginManager([
	setup,
	authenticate,
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

	const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, -1);
	context.subscriptions.push(statusBarItem);
	statusBarItem.text = "$(loading~spin) LocalStack";
	statusBarItem.show();

	const containerStatusTracker = await createContainerStatusTracker(
		"localstack-main",
		outputChannel,
	);
	context.subscriptions.push(containerStatusTracker);

	const localStackStatusTracker = await createLocalStackStatusTracker(
		containerStatusTracker,
		outputChannel,
	);
	context.subscriptions.push(localStackStatusTracker);

	context.subscriptions.push(setupStatusTracker);
	const setupStatusTracker = await createSetupStatusTracker(outputChannel);

	const sessionId = await getOrCreateExtensionSessionId(context);
	const telemetry = createTelemetry(outputChannel, sessionId);

	await plugins.activate({
		context,
		outputChannel,
		statusBarItem,
		containerStatusTracker,
		localStackStatusTracker,
		setupStatusTracker,
		telemetry,
	});
}

export async function deactivate() {
	await plugins.deactivate();
}
