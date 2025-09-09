import { commands, QuickPickItemKind, ThemeColor, window } from "vscode";
import type { QuickPickItem } from "vscode";

import { createPlugin } from "../plugins.ts";

export default createPlugin(
	"status-bar",
	({
		context,
		statusBarItem,
		localStackStatusTracker,
		setupStatusTracker,
		outputChannel,
	}) => {
		context.subscriptions.push(
			commands.registerCommand("localstack.showCommands", async () => {
				const shouldShowLocalStackStart = () =>
					setupStatusTracker.statuses().isInstalled &&
					localStackStatusTracker.status() === "stopped";
				const shouldShowLocalStackStop = () =>
					setupStatusTracker.statuses().isInstalled &&
					localStackStatusTracker.status() === "running";
				const shouldShowRunSetupWizard = () =>
					setupStatusTracker.status() === "setup_required";

				const getCommands = () => {
					const commands: (QuickPickItem & { command: string })[] = [];

					commands.push({
						label: "Configure",
						command: "",
						kind: QuickPickItemKind.Separator,
					});

					if (shouldShowRunSetupWizard()) {
						commands.push({
							label: "Run LocalStack Setup Wizard",
							command: "localstack.setup",
						});
					}

					commands.push({
						label: "Manage",
						command: "",
						kind: QuickPickItemKind.Separator,
					});

					if (shouldShowLocalStackStart()) {
						commands.push({
							label: "Start LocalStack",
							command: "localstack.start",
						});
					}

					if (shouldShowLocalStackStop()) {
						commands.push({
							label: "Stop LocalStack",
							command: "localstack.stop",
						});
					}

					commands.push({
						label: "View Logs",
						command: "localstack.viewLogs",
					});

					return commands;
				};

				const selected = await window.showQuickPick(getCommands(), {
					placeHolder: "Select a LocalStack command",
				});

				if (selected) {
					void commands.executeCommand(selected.command);
				}
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.refreshStatusBar", () => {
				const setupStatus = setupStatusTracker.status();
				const localStackStatus = localStackStatusTracker.status();
				const localStackInstalled = setupStatusTracker.statuses().isInstalled;

				statusBarItem.command = "localstack.showCommands";
				statusBarItem.backgroundColor =
					setupStatus === "setup_required"
						? new ThemeColor("statusBarItem.errorBackground")
						: undefined;

				const shouldSpin =
					localStackStatus === "starting" || localStackStatus === "stopping";
				const icon =
					setupStatus === "setup_required"
						? "$(error)"
						: shouldSpin
							? "$(sync~spin)"
							: "$(localstack-logo)";

				const statusText = localStackInstalled
					? `${localStackStatus}`
					: "not installed";
				statusBarItem.text = `${icon} LocalStack: ${statusText}`;

				statusBarItem.tooltip = "Show LocalStack commands";
				statusBarItem.show();
			}),
		);

		let refreshStatusBarImmediateId: NodeJS.Immediate | undefined;
		const refreshStatusBarImmediate = () => {
			if (!refreshStatusBarImmediateId) {
				refreshStatusBarImmediateId = setImmediate(() => {
					void commands.executeCommand("localstack.refreshStatusBar");
					refreshStatusBarImmediateId = undefined;
				});
			}
		};

		context.subscriptions.push({
			dispose() {
				clearImmediate(refreshStatusBarImmediateId);
			},
		});

		refreshStatusBarImmediate();

		localStackStatusTracker.onChange(() => {
			outputChannel.trace("[status-bar]: localStackStatusTracker changed");
			refreshStatusBarImmediate();
		});

		setupStatusTracker.onChange(() => {
			outputChannel.trace("[status-bar]: setupStatusTracker changed");
			refreshStatusBarImmediate();
		});
	},
);
