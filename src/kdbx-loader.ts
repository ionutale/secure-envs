import * as kdbxweb from 'kdbxweb';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Polyfill for Node.js if needed (Node 19+ has global crypto)
if (!global.crypto) {
    // @ts-ignore
    global.crypto = crypto.webcrypto;
}

export type EnvVarMap = { [key: string]: string };

export async function loadKdbxVariables(filePath: string, password: string, variableNames: string[], keyFile?: string): Promise<EnvVarMap> {
    try {
        const db = await loadDatabase(filePath, password, keyFile);
        return extractVariables(db, variableNames);
    } catch (error) {
        handleError(error);
        throw error;
    }
}

async function loadDatabase(filePath: string, password: string, keyFile?: string): Promise<kdbxweb.Kdbx> {
    const fileBuffer = readFileAsBuffer(filePath);
    const credentials = createCredentials(password, keyFile);
    return await kdbxweb.Kdbx.load(fileBuffer, credentials);
}

function readFileAsBuffer(filePath: string): ArrayBuffer {
    const data = fs.readFileSync(filePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function createCredentials(password: string, keyFile?: string): kdbxweb.Credentials {
    let keyFileArrayBuffer: ArrayBuffer | undefined;
    
    if (keyFile) {
        keyFileArrayBuffer = readFileAsBuffer(keyFile);
    }

    return new kdbxweb.Credentials(
        kdbxweb.ProtectedValue.fromString(password), 
        keyFileArrayBuffer
    );
}

function extractVariables(db: kdbxweb.Kdbx, variableNames: string[]): EnvVarMap {
    const result: EnvVarMap = {};
    const varsToFind = new Set(variableNames);

    traverseGroup(db.getDefaultGroup(), varsToFind, result);
    verifyFoundVariables(variableNames, result);

    return result;
}

function traverseGroup(group: kdbxweb.KdbxGroup, varsToFind: Set<string>, result: EnvVarMap) {
    for (const entry of group.entries) {
        const title = entry.fields.get('Title');
        if (typeof title === 'string' && varsToFind.has(title)) {
            result[title] = getValueFromEntry(entry);
        }
    }
    
    for (const subGroup of group.groups) {
        traverseGroup(subGroup, varsToFind, result);
    }
}

function getValueFromEntry(entry: kdbxweb.KdbxEntry): string {
    const passwordField = entry.fields.get('Password');
    
    if (passwordField instanceof kdbxweb.ProtectedValue) {
        return passwordField.getText();
    }
    
    return String(passwordField || '');
}

function verifyFoundVariables(requested: string[], found: EnvVarMap) {
    const foundKeys = Object.keys(found);
    if (foundKeys.length < requested.length) {
        const missing = requested.filter(v => !foundKeys.includes(v));
        console.warn(`Warning: Could not find the following variables in the KDBX file: ${missing.join(', ')}`);
    }
}

function handleError(error: unknown) {
    if (error instanceof Error) {
        // Common error is bad password, which throws generic errors often
        if (error.message.includes('HMAC') || error.message.includes('password')) {
            throw new Error('Failed to decrypt KDBX file. Check your password or keyfile.');
        }
    }
}
