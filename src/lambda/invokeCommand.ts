import * as vscode from 'vscode';
import { logOutputChannel, showLogOutputChannel } from '../utils/outputChannel';
import { CloudFormationClient, DescribeStackResourcesCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { LambdaClient, InvokeCommand, InvocationRequest } from "@aws-sdk/client-lambda";

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
    const describeStacksCommand = new DescribeStacksCommand({});
    try {
        const stacksResponse = await cloudformationClient.send(describeStacksCommand);
        const stackNames = stacksResponse.Stacks?.map(stack => stack.StackName);
        // TODO: show first step in multi-Step quick pick
    } catch (error) {
        console.error(error);
    }

    // TODO: replace hardcoded stack name with dynamically selected one
    const stackName = 'my-stack';
    const input = { StackName: stackName };
    const describeStackResourcesCommand = new DescribeStackResourcesCommand(input);
    try {
        const resourcesResponse = await cloudformationClient.send(describeStackResourcesCommand);
        const functionNames = resourcesResponse.StackResources?.filter(resource => resource.ResourceType === 'AWS::Lambda::Function').map(resource => resource.PhysicalResourceId);
        // TODO: show second step in multi-Step quick pick
    } catch (error) {
        console.error(error);
    }

    // TODO: replace hardcoded function name with dynamically selected one
    const functionName = 'hello-world-function';
    const payload = {};
    const invokeInput: InvocationRequest = {
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        LogType: 'Tail',
        Payload: Buffer.from(JSON.stringify(payload), "utf8"),
        // Qualifier: 'VERSION|ALIAS',
    };
    const invokeCommand = new InvokeCommand(invokeInput);
    const lambdaClient = new LambdaClient(clientConfig);
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
