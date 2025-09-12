import { commands, QuickPickItemKind, ThemeColor, window } from "vscode";
import type { QuickPickItem } from "vscode";

import { createPlugin } from "../plugins.ts";
import { immediateOnce } from "../utils/immediate-once.ts";

export default createPlugin(
	"status-bar",
	({
		context,
		statusBarItem,
		cliStatusTracker,
		localStackStatusTracker,
		setupStatusTracker,
		outputChannel,
	}) => {
		context.subscriptions.push(
			commands.registerCommand("localstack.showCommands", async () => {
				const shouldShowLocalStackStart = () =>
					cliStatusTracker.status() === "ok" &&
					localStackStatusTracker.status() === "stopped";
				const shouldShowLocalStackStop = () =>
					cliStatusTracker.status() === "ok" &&
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

		const renderStatusBar = immediateOnce(() => {
			const setupStatus = setupStatusTracker.status();
			const localStackStatus = localStackStatusTracker.status();
			const cliStatus = cliStatusTracker.status();
			outputChannel.trace(
				`[status-bar] setupStatus=${setupStatus} localStackStatus=${localStackStatus} cliStatus=${cliStatus}`,
			);

			// Skip rendering the status bar if any of the status checks is not ready.
			if (setupStatus === undefined || cliStatus === undefined) {
				return;
			}

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

			const statusText =
				cliStatus === "ok" ? `${localStackStatus}` : "not installed";
			statusBarItem.text = `${icon} LocalStack: ${statusText}`;

			statusBarItem.tooltip = "Show LocalStack commands";
			// statusBarItem.show();
		});

		// refreshStatusBar();

		localStackStatusTracker.onChange(() => {
			outputChannel.trace("[status-bar]: localStackStatusTracker changed");
			renderStatusBar();
		});

		setupStatusTracker.onChange(() => {
			outputChannel.trace("[status-bar]: setupStatusTracker changed");
			renderStatusBar();
		});
	},
);
