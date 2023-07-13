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
function findYamlFiles(directoryPath: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        const pattern = '**/*.yaml';
        const options = {
            cwd: directoryPath,
            nodir: true,
            ignore: 'node_modules/**',
        };

        glob(pattern, options, (err: Error | null, files: string[]) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(files);
        });
    });
}
