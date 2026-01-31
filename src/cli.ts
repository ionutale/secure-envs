#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import spawn from 'cross-spawn';
import promptSync from 'prompt-sync';
import * as path from 'path';
import { loadKdbxVariables } from './kdbx-loader';

const prompt = promptSync({ sigint: true });

async function main() {
    const argv = await parseArgs();
    
    validateCommand(argv._);

    const config = getConfiguration(argv);
    const password = getPassword();

    try {
        await runCommandWithSecrets(config, password, argv._);
    } catch (error: any) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

async function parseArgs() {
    return yargs(hideBin(process.argv))
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
}

function validateCommand(commandArgs: (string | number)[]) {
    if (commandArgs.length === 0) {
        console.error('Error: No command specified to run. Use "-- <command>"');
        process.exit(1);
    }
}

function getConfiguration(argv: any) {
    return {
        kdbxPath: path.resolve(process.cwd(), argv.file),
        variables: argv.vars as string[],
        keyFile: argv.keyfile as string | undefined
    };
}

function getPassword(): string {
    let password = process.env.KDBX_PASSWORD;
    
    if (!password) {
        password = prompt('Enter KDBX password: ', { echo: '*' });
    }

    if (!password) {
        console.error('Password is required.');
        process.exit(1);
    }
    return password;
}

async function runCommandWithSecrets(config: ReturnType<typeof getConfiguration>, password: string, commandArgs: (string | number)[]) {
    console.log('Loading variables from KDBX...');
    const secretEnv = await loadKdbxVariables(config.kdbxPath, password, config.variables, config.keyFile);

    const newEnv = {
        ...process.env,
        ...secretEnv
    };

    const command = String(commandArgs[0]);
    const args = commandArgs.slice(1).map(String);

    console.log(`Running: ${command} ${args.join(' ')}`);

    spawnProcess(command, args, newEnv);
}

function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv) {
    const child = spawn(command, args, {
        env: env,
        stdio: 'inherit'
    });

    child.on('close', (code) => {
        process.exit(code || 0);
    });

    child.on('error', (err) => {
        console.error('Failed to start subprocess:', err);
    });
}

main();
