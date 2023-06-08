import * as vscode from "vscode";
import { execShell } from "../utils/shell";
import { CancellationToken, QuickInputButton, QuickPickItem, Uri, window } from "vscode";
import { MultiStepInput } from "../utils/multiStepInput";


export async function deployLambda(context: vscode.ExtensionContext) {
  // TODO: show wizard with list of template.yaml in the project

    // Add VSCode multi-step sample: https://github.com/microsoft/vscode-extension-samples/blob/main/quickinput-sample/src/multiStepInput.ts
    class MyButton implements QuickInputButton {
        constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }
    }

    const createResourceGroupButton = new MyButton({
        dark: Uri.file(context.asAbsolutePath('resources/dark/add.svg')),
        light: Uri.file(context.asAbsolutePath('resources/light/add.svg')),
    }, 'Create Resource Group');

    const resourceGroups: QuickPickItem[] = [
        "vscode-data-function",
        "vscode-appservice-microservices",
        "vscode-appservice-monitor",
        "vscode-appservice-preview",
        "vscode-appservice-prod",
    ].map((label) => ({ label }));

    interface State {
		title: string;
		step: number;
		totalSteps: number;
		resourceGroup: QuickPickItem | string;
		name: string;
		runtime: QuickPickItem;
	}

    async function collectInputs() {
        const state = {} as Partial<State>;
        await MultiStepInput.run(input => pickResourceGroup(input, state));
        return state as State;
    }

	const title = 'Create Application Service';

	async function pickResourceGroup(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 3,
			placeholder: 'Pick a resource group',
			items: resourceGroups,
			activeItem: typeof state.resourceGroup !== 'string' ? state.resourceGroup : undefined,
			buttons: [createResourceGroupButton],
			shouldResume: shouldResume
		});
		if (pick instanceof MyButton) {
			return (input: MultiStepInput) => inputResourceGroupName(input, state);
		}
		state.resourceGroup = pick;
		return (input: MultiStepInput) => inputName(input, state);
	}

	async function inputResourceGroupName(input: MultiStepInput, state: Partial<State>) {
		state.resourceGroup = await input.showInputBox({
			title,
			step: 2,
			totalSteps: 4,
			value: typeof state.resourceGroup === 'string' ? state.resourceGroup : '',
			prompt: 'Choose a unique name for the resource group',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => inputName(input, state);
	}

	async function inputName(input: MultiStepInput, state: Partial<State>) {
		const additionalSteps = typeof state.resourceGroup === 'string' ? 1 : 0;
		// TODO: Remember current value when navigating back.
		state.name = await input.showInputBox({
			title,
			step: 2 + additionalSteps,
			totalSteps: 3 + additionalSteps,
			value: state.name || '',
			prompt: 'Choose a unique name for the Application Service',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => pickRuntime(input, state);
	}

	async function pickRuntime(input: MultiStepInput, state: Partial<State>) {
		const additionalSteps = typeof state.resourceGroup === 'string' ? 1 : 0;
		const runtimes = await getAvailableRuntimes(state.resourceGroup!, undefined /* TODO: token */);
		// TODO: Remember currently active item when navigating back.
		state.runtime = await input.showQuickPick({
			title,
			step: 3 + additionalSteps,
			totalSteps: 3 + additionalSteps,
			placeholder: 'Pick a runtime',
			items: runtimes,
			activeItem: state.runtime,
			shouldResume: shouldResume
		});
	}

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validateNameIsUnique(name: string) {
		// ...validate...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return name === 'vscode' ? 'Name not unique' : undefined;
	}

	async function getAvailableRuntimes(resourceGroup: QuickPickItem | string, token?: CancellationToken): Promise<QuickPickItem[]> {
		// ...retrieve...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return ['Node 8.9', 'Node 6.11', 'Node 4.5']
			.map(label => ({ label }));
	}

	const state = await collectInputs();
	window.showInformationMessage(`Creating Application Service '${state.name}'`);

  // TODO: build dynamic sam deploy command based on template location

    // The code you place here will be executed every time your command is executed
    vscode.window.showInformationMessage(`Deploying Lambda function to LocalStack ...`);
    const stdout = await execShell("cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && make deploy");
    vscode.window.showInformationMessage(`Lambda function deployed to LocalStack.`);
}
