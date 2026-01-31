#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import spawn from 'cross-spawn';
import promptSync from 'prompt-sync';
import * as path from 'path';
import { KdbxEnvLoader } from './kdbx-loader';

const prompt = promptSync({ sigint: true });

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('file', {
            alias: 'f',
            type: 'string',
            description: 'Path to .kdbx file',
            demandOption: true
        })
        .option('vars', {
            alias: 'v',
            type: 'array',
            description: 'List of variable names to load (Space separated)',
            demandOption: true,
            string: true
        })
        .option('keyfile', {
            alias: 'k',
            type: 'string',
            description: 'Path to key file'
        })
        .usage('Usage: $0 --file <path> --vars <VAR1> <VAR2> -- <command>')
        .help()
        .parse();

    const kdbxPath = path.resolve(process.cwd(), argv.file);
    const variables = argv.vars as string[];
    const commandArgs = argv._;

    if (commandArgs.length === 0) {
        console.error('Error: No command specified to run. Use "-- <command>"');
        process.exit(1);
    }

    let password = process.env.KDBX_PASSWORD;
    
    if (!password) {
        password = prompt('Enter KDBX password: ', { echo: '*' });
    }

    if (!password) {
        console.error('Password is required.');
        process.exit(1);
    }

    try {
        const loader = new KdbxEnvLoader(kdbxPath);
        console.log('Loading variables from KDBX...');
        const secretEnv = await loader.loadVariables(password, variables, argv.keyfile);

        const newEnv = {
            ...process.env,
            ...secretEnv
        };

        const command = commandArgs[0] as string;
        const args = commandArgs.slice(1) as string[];

        console.log(`Running: ${command} ${args.join(' ')}`);

        const child = spawn(command, args, {
            env: newEnv,
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            process.exit(code || 0);
        });

        child.on('error', (err) => {
            console.error('Failed to start subprocess:', err);
        });

    } catch (error: any) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
