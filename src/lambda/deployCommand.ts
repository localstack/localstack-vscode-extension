import * as vscode from "vscode";
import { execShell } from "../utils/shell";
import { CancellationToken, QuickInputButton, QuickPickItem, Uri, window } from "vscode";
import { MultiStepInput } from "../utils/multiStepInput";
import { findCFNTemplates } from "../utils/templateFinder";

export async function deployLambda(context: vscode.ExtensionContext) {
    // Based on VSCode multi-step sample:
    // https://github.com/microsoft/vscode-extension-samples/blob/main/quickinput-sample/src/multiStepInput.ts
    class MyButton implements QuickInputButton {
        constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }
    }

    const createDeploymentConfigButton = new MyButton({
        dark: Uri.file(context.asAbsolutePath('resources/dark/add.svg')),
        light: Uri.file(context.asAbsolutePath('resources/light/add.svg')),
    }, 'Create Deployment Configuration ...');

    // TODO: fetch hardcoded handler path from CodeLens
    const handlerPath = '/Users/joe/Projects/Lambda-IDE-Integration/lambda-python/hello_world/app.py';
	const handlerUri = vscode.Uri.file(handlerPath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(handlerUri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage(`Workspace undefined. Please open a workspace.`);
		return undefined;
    }
	const templates = await findCFNTemplates(workspaceFolder.uri.fsPath);

    // MAYBE: implement Quick Deploy
    // MAYBE: implement custom deployment configuration ...
    const staticItems = [
        "template.yaml",
		"output/template.yaml",
        "template.yaml:HelloWorldFunction (goal)",
        "Quick Deploy (extension)",
        "Create Deployment Configuration ... (manual)",
    ];
	const deploymentConfigs: QuickPickItem[] = templates.map((label) => ({ label }));

    interface State {
		title: string;
		step: number;
		totalSteps: number;
		deploymentConfig: QuickPickItem | string;
		stackName: string;
		runtime: QuickPickItem;
	}

    async function collectInputs() {
        const state = {} as Partial<State>;
        await MultiStepInput.run(input => pickDeploymentConfig(input, state));
        return state as State;
    }

	const title = 'Deploy a Lambda Function';

	async function pickDeploymentConfig(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 2,
			placeholder: 'Pick a deployment configuration',
			items: deploymentConfigs,
			activeItem: typeof state.deploymentConfig !== 'string' ? state.deploymentConfig : undefined,
			buttons: [createDeploymentConfigButton],
			shouldResume: shouldResume
		});
        // TODO: handle custom creation of deployment configuration
		if (pick instanceof MyButton) {
			return (input: MultiStepInput) => inputDeploymentConfigName(input, state);
		}
		state.deploymentConfig = pick;
        if (pick.label === 'Quick Deploy') {
            return (input: MultiStepInput) => pickRuntime(input, state);
        } else {
            return (input: MultiStepInput) => inputStackName(input, state);
        }
	}

    // TODO: handle creation of custom deployment configuration
	async function inputDeploymentConfigName(input: MultiStepInput, state: Partial<State>) {
		state.deploymentConfig = await input.showInputBox({
			title,
			step: 2,
			totalSteps: 4,
			value: typeof state.deploymentConfig === 'string' ? state.deploymentConfig : '',
			prompt: 'Choose a unique name for the deployment configuration',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => inputStackName(input, state);
	}

	async function inputStackName(input: MultiStepInput, state: Partial<State>) {
		const additionalSteps = typeof state.deploymentConfig === 'string' ? 1 : 0;
		// TODO: Remember current value when navigating back.
		state.stackName = await input.showInputBox({
			title,
			step: 2 + additionalSteps,
			totalSteps: 2 + additionalSteps,
			value: state.stackName || '',
			prompt: 'Choose a unique name for the CloudFormation Stack',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
	}

	async function pickRuntime(input: MultiStepInput, state: Partial<State>) {
		const additionalSteps = typeof state.deploymentConfig === 'string' ? 1 : 0;
		const runtimes = await getAvailableRuntimes(undefined /* TODO: token */);
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

	async function getAvailableRuntimes(token?: CancellationToken): Promise<QuickPickItem[]> {
		// await new Promise(resolve => setTimeout(resolve, 1000));
        // Source: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
		return ['python3.7', 'python3.8', 'python3.9', 'python3.10']
			.map(label => ({ label }));
	}

	const state = await collectInputs();

    // The code you place here will be executed every time your command is executed
    vscode.window.showInformationMessage(`Deploying Lambda function to LocalStack using ${state.stackName} ...`);
    // const deployCmd = `samlocal deploy --template template.yaml --stack-name lambda-python-stack --region us-east-1 --resolve-s3 --no-confirm-changeset`
    // HACK: workaround type checking
    const deploymentConfig: any = state.deploymentConfig;
    const deployCmd = `samlocal deploy --template ${deploymentConfig.label} --stack-name ${state.stackName} --resolve-s3 --no-confirm-changeset`
    // vscode.window.showInformationMessage(`deployCmd=${deployCmd}`);
    // const stdout = await execShell("cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && make deploy");
    const stdout = await execShell(`cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && ${deployCmd}`);
    vscode.window.showInformationMessage(`Lambda function deployed to LocalStack.`);
}
