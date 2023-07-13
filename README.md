# LocalStack VSCode Extension (Preview)

![Marketplace Version](https://img.shields.io/vscode-marketplace/v/LocalStack.localstack.svg)

**Deploy and invoke Lambda functions in LocalStack directly from VSCode.**

👉 Get our [LocalStack VSCode Extension](https://marketplace.visualstudio.com/items?itemName=LocalStack.localstack) from the Visual Studio Marketplace.

> 🧪 We encourage you to test the current preview version and share your feedback with us.

## Features

Deploy Python Lambda function directly from your code using an [AWS SAM](https://github.com/aws/serverless-application-model) or [AWS CloudFormation](https://aws.amazon.com/cloudformation/resources/templates/) template:
![Deploy Lambda function](resources/images/deploy-lambda.gif)

Invoke Lambda function:
![Invoke Lambda function](resources/images/invoke-lambda.gif)

## Requirements

* [samlocal](https://github.com/localstack/aws-sam-cli-local) command line wrapper around the [AWS SAM CLI](https://github.com/aws/aws-sam-cli) for use with [LocalStack](https://github.com/localstack/localstack).
* [LocalStack](https://docs.localstack.cloud/getting-started/) running in the background.

## Known Issues

* Limitations
  * The CodeLens for "Deploy Lambda function" always appears at the first line of each Python file
  * "Invoke Lambda function" currently only works in the region `us-east-1` and with an empty payload.

## Feedback

<!-- TODO: link to Discuss post or Slack for feedback. Create some feature requests to upvote. -->

We are looking forward to your feedback in our Community Slack [slack.localstack.cloud](https://slack.localstack.cloud/).
