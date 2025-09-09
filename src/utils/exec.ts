import * as childProcess from "node:child_process";
import * as util from "node:util";

export const exec = util.promisify(childProcess.exec);
