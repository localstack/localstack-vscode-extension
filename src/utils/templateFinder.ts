import * as vscode from 'vscode';
// import { CloudFormation } from '../cloudformation/cloudformation';
import { glob } from 'glob';

export async function findCFNTemplates(directoryPath: string): Promise<string[]> {
    const templateCandidates = await findYamlFiles(directoryPath);
    const templates: string[] = [];
    templateCandidates.forEach(function (candidate) {
        // TODO: validate Cfn and add valid ones to templates
        templates.push(candidate);
    }); 
    return templates;
}


// Limitation: could take a long time in directories with many yaml files
// glob: https://github.com/isaacs/node-glob
export async function findYamlFiles(directoryPath: string): Promise<string[]> {
    const pattern = '**/*.yaml';
    const options = {
        cwd: directoryPath,
        nodir: true,
        ignore: 'node_modules/**',
    };

    return await glob(pattern, options);
}
