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

export class KdbxEnvLoader {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    async loadVariables(password: string, variableNames: string[], keyFile?: string): Promise<EnvVarMap> {
        try {
            const data = fs.readFileSync(this.filePath);
            const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

             let keyFileArrayBuffer: ArrayBuffer | undefined = undefined;
            if (keyFile) {
                 const keyFileBuffer = fs.readFileSync(keyFile);
                 keyFileArrayBuffer = keyFileBuffer.buffer.slice(keyFileBuffer.byteOffset, keyFileBuffer.byteOffset + keyFileBuffer.byteLength);
            }

            const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyFileArrayBuffer);
            
            const db = await kdbxweb.Kdbx.load(arrayBuffer as ArrayBuffer, credentials);
            
            const result: EnvVarMap = {};
            const varsToFind = new Set(variableNames);

            // Helper to recursively search groups
            const traverseGroup = (group: kdbxweb.KdbxGroup) => {
                for (const entry of group.entries) {
                    const title = entry.fields.get('Title');
                    if (!title) continue;
                    
                    if (typeof title === 'string' && varsToFind.has(title)) {
                        const passwordField = entry.fields.get('Password');
                        let value = '';
                        
                        if (passwordField instanceof kdbxweb.ProtectedValue) {
                            value = passwordField.getText();
                        } else {
                            value = String(passwordField || '');
                        }

                        result[title] = value;
                    }
                }
                
                for (const subGroup of group.groups) {
                    traverseGroup(subGroup);
                }
            };

            traverseGroup(db.getDefaultGroup());

            // Check if we found everything
            const foundKeys = Object.keys(result);
            if (foundKeys.length < variableNames.length) {
                const missing = variableNames.filter(v => !foundKeys.includes(v));
                console.warn(`Warning: Could not find the following variables in the KDBX file: ${missing.join(', ')}`);
            }

            return result;

        } catch (error) {
            if (error instanceof Error) {
                 // Common error is bad password, which throws generic errors often
                 if (error.message.includes('HMAC') || error.message.includes('password')) {
                     throw new Error('Failed to decrypt KDBX file. Check your password or keyfile.');
                 }
            }
            throw error;
        }
    }
}
