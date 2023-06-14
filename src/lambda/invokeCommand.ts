import * as vscode from 'vscode';
import { logOutputChannel, showLogOutputChannel } from '../utils/outputChannel';
import { CloudFormationClient, DescribeStackResourcesCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { LambdaClient, InvokeCommand, InvocationRequest } from "@aws-sdk/client-lambda";
import { QuickPickItem } from 'vscode';
import { MultiStepInput } from '../utils/multiStepInput';

export async function invokeLambda() {
    const clientConfig = {
        region: "us-east-1",
        endpoint: "http://localhost:4566",
        credentials: {
            accessKeyId: 'test',
            secretAccessKey: 'test'
        }
    };
    const cloudformationClient = new CloudFormationClient(clientConfig);
    const lambdaClient = new LambdaClient(clientConfig);

    interface State {
		title: string;
		step: number;
		totalSteps: number;
		stackName: QuickPickItem;
		functionName: QuickPickItem;
	}

    async function collectInputs() {
        const state = {} as Partial<State>;
        await MultiStepInput.run(input => pickStackName(input, state));
        return state as State;
    }

    const title = 'Invoke a Lambda Function';

	async function pickStackName(input: MultiStepInput, state: Partial<State>) {
        const describeStacksCommand = new DescribeStacksCommand({});
        try {
            const stacksResponse = await cloudformationClient.send(describeStacksCommand);
            const stackNames = stacksResponse.Stacks?.map(stack => stack.StackName!);
            // TODO: fix typings mess
            if (stackNames === undefined) {
                return undefined;
            }
            const stackNamesPicks: QuickPickItem[] = stackNames.map((label) => ({ label }));
            state.stackName = await input.showQuickPick({
                title,
                step: 1,
                totalSteps: 2,
                placeholder: 'Pick a CloudFormation stack name',
                items: stackNamesPicks,
                activeItem: typeof state.stackName !== 'string' ? state.stackName : undefined,
                shouldResume: shouldResume
            });

            return (input: MultiStepInput) => pickFunctionName(input, state);
        } catch (error) {
            console.error(error);
        }
	}

    async function pickFunctionName(input: MultiStepInput, state: Partial<State>) {
        const stackName = state.stackName?.label;
        const params = { StackName: stackName };
        const describeStackResourcesCommand = new DescribeStackResourcesCommand(params);
        try {
            const resourcesResponse = await cloudformationClient.send(describeStackResourcesCommand);
            const functionNames = resourcesResponse.StackResources?.filter(resource => resource.ResourceType === 'AWS::Lambda::Function').map(resource => resource.PhysicalResourceId!);
            // TODO: fix typings mess
            if (functionNames === undefined) {
                return undefined;
            }
            const functionNamesPicks: QuickPickItem[] = functionNames.map((label) => ({ label }));
            state.functionName = await input.showQuickPick({
                title,
                step: 2,
                totalSteps: 2,
                placeholder: 'Pick a function name',
                items: functionNamesPicks,
                activeItem: typeof state.functionName !== 'string' ? state.functionName : undefined,
                shouldResume: shouldResume
            });
        } catch (error) {
            console.error(error);
        }
	}

    function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

    const state = await collectInputs();

    const functionName = state.functionName.label;
    const payload = {};
    const invokeInput: InvocationRequest = {
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        LogType: 'Tail',
        Payload: Buffer.from(JSON.stringify(payload), "utf8"),
        // Qualifier: 'VERSION|ALIAS',
    };
    const invokeCommand = new InvokeCommand(invokeInput);
    vscode.window.showInformationMessage(`Invoke Lambda function ${functionName} in LocalStack.`);
    try {
        const invocationResponse = await lambdaClient.send(invokeCommand);
        if (invocationResponse.LogResult) {
            const invocationLogs = Buffer.from(invocationResponse.LogResult, "base64").toString("utf8");
            logOutputChannel.appendLine(invocationLogs);
        }
        if (invocationResponse.Payload) {
            const payloadResponseString = Buffer.from(invocationResponse.Payload).toString();
            try {
                const payloadJson = JSON.parse(payloadResponseString);
                const prettyPayload = JSON.stringify(payloadJson, null, 2);
                logOutputChannel.appendLine(prettyPayload);
            } catch {
                logOutputChannel.appendLine(payloadResponseString);
            }
        }
        showLogOutputChannel();
    } catch (error) {
        console.error(error);
    }
}
