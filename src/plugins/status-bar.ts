import { commands, QuickPickItemKind, ThemeColor, window } from "vscode";
import type { QuickPickItem } from "vscode";

import { createPlugin } from "../plugins.ts";

export default createPlugin(
	"status-bar",
	({ context, statusBarItem, localStackStatusTracker, setupStatusTracker }) => {
		context.subscriptions.push(
			commands.registerCommand("localstack.showCommands", async () => {
				const shouldShowLocalStackStart = () =>
					localStackStatusTracker.status() === "stopped";
				const shouldShowLocalStackStop = () =>
					localStackStatusTracker.status() === "running";
				const shouldShowRunSetupWizard = () =>
					setupStatusTracker.status() === "setup_required";

				const getCommands = async () => {
					const commands: (QuickPickItem & { command: string })[] = [];
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

					commands.push({
						label: "Configure",
						command: "",
						kind: QuickPickItemKind.Separator,
					});

					if (shouldShowRunSetupWizard()) {
						commands.push({
							label: "Run LocalStack setup Wizard",
							command: "localstack.setup",
						});
					}

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

				if (setupStatus === "setup_required") {
					statusBarItem.command = "localstack.showCommands";
					statusBarItem.text = "$(error) LocalStack";
					statusBarItem.backgroundColor = new ThemeColor(
						"statusBarItem.errorBackground",
					);
				} else {
					statusBarItem.command = "localstack.showCommands";
					statusBarItem.backgroundColor = undefined;
					const localStackStatus = localStackStatusTracker.status();
					if (
						localStackStatus === "starting" ||
						localStackStatus === "stopping"
					) {
						statusBarItem.text = `$(sync~spin) LocalStack (${localStackStatus})`;
					} else if (
						localStackStatus === "running" ||
						localStackStatus === "stopped"
					) {
						statusBarItem.text = `$(localstack-logo) LocalStack (${localStackStatus})`;
					}
				}

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
			refreshStatusBarImmediate();
		});

		setupStatusTracker.onChange(() => {
			refreshStatusBarImmediate();
		});
	},
);
