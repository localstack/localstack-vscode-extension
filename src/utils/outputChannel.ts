/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Changes:
 * 2023-06-09: Change name of output channel
 */
// Source: https://github.com/aws/aws-toolkit-vscode/blob/master/src/shared/logger/outputChannel.ts

import * as vscode from 'vscode'

export const logOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('LocalStack')

/**
 * Shows the log output channel.
 */
export function showLogOutputChannel({ preserveFocus = true }: { preserveFocus?: boolean } = {}): void {
    logOutputChannel.show(preserveFocus)
}
