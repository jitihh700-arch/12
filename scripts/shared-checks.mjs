import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const rootDir = path.resolve(import.meta.dirname, '..');

export function trackedFiles() {
    const output = execFileSync('git', ['ls-files'], { cwd: rootDir, encoding: 'utf8' });
    return output.split(/\r?\n/).filter(Boolean);
}

export function readText(file) {
    return fs.readFileSync(path.join(rootDir, file), 'utf8');
}

export function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

export function jsFiles(files = trackedFiles()) {
    return files.filter(file => /\.(c?m?js)$/.test(file));
}

export function checkNodeSyntax(files) {
    for (const file of files) {
        execFileSync(process.execPath, ['--check', file], { cwd: rootDir, stdio: 'inherit' });
    }
}
