import { loadKdbxVariables } from '../src/kdbx-loader';
import * as kdbxweb from 'kdbxweb';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');

// Mock kdbxweb module
jest.mock('kdbxweb', () => {
    class MockProtectedValue {
        private value: string;
        constructor(value: string) {
            this.value = value;
        }
        getText() {
            return this.value;
        }
        static fromString(value: string) {
            return new MockProtectedValue(value);
        }
    }

    return {
        Kdbx: {
            load: jest.fn()
        },
        Credentials: jest.fn(),
        ProtectedValue: MockProtectedValue,
        // We need to mock other things if they are used, e.g. types
        KdbxGroup: jest.fn(),
        KdbxEntry: jest.fn()
    };
});

describe('kdbx-loader', () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockKdbx = kdbxweb.Kdbx as jest.Mocked<typeof kdbxweb.Kdbx>;

    // Helper to create mock entries
    const createMockEntry = (title: string, password: string | any) => ({
        fields: {
            get: (field: string) => {
                if (field === 'Title') return title;
                if (field === 'Password') return password;
                return undefined;
            }
        }
    });

    const createMockGroup = (entries: any[] = [], groups: any[] = []) => ({
        entries,
        groups
    });

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default fs mock
        mockFs.readFileSync.mockReturnValue(Buffer.from('mock-file-content'));
    });

    it('should successfully load variables from KDBX file', async () => {
        // @ts-ignore
        const passwordVal = new kdbxweb.ProtectedValue('secret-value');
        const dbMock = {
            getDefaultGroup: jest.fn().mockReturnValue(
                createMockGroup([
                    createMockEntry('DATABASE_URL', passwordVal),
                    createMockEntry('OTHER_VAR', 'plain-text-value')
                ])
            )
        };

        (mockKdbx.load as jest.Mock).mockResolvedValue(dbMock);

        const variables = ['DATABASE_URL'];
        const result = await loadKdbxVariables('path/to/db.kdbx', 'masterpass', variables);

        expect(result).toEqual({
            DATABASE_URL: 'secret-value'
        });
        expect(mockFs.readFileSync).toHaveBeenCalledWith('path/to/db.kdbx');
        expect(kdbxweb.Credentials).toHaveBeenCalled();
        expect(mockKdbx.load).toHaveBeenCalled();
    });

    it('should handle variables in nested groups', async () => {
        // @ts-ignore
        const passwordVal = new kdbxweb.ProtectedValue('nested-secret');
        const dbMock = {
            getDefaultGroup: jest.fn().mockReturnValue(
                createMockGroup(
                    [], // No entries in root
                    [
                        createMockGroup([
                            createMockEntry('API_KEY', passwordVal)
                        ])
                    ]
                )
            )
        };

        (mockKdbx.load as jest.Mock).mockResolvedValue(dbMock);

        const result = await loadKdbxVariables('db.kdbx', 'pass', ['API_KEY']);
        expect(result).toEqual({
            API_KEY: 'nested-secret'
        });
    });

    it('should return empty string for missing password field', async () => {
        const dbMock = {
            getDefaultGroup: jest.fn().mockReturnValue(
                createMockGroup([
                    createMockEntry('EMPTY_PASS', null)
                ])
            )
        };

        (mockKdbx.load as jest.Mock).mockResolvedValue(dbMock);

        const result = await loadKdbxVariables('db.kdbx', 'pass', ['EMPTY_PASS']);
        expect(result).toEqual({
            EMPTY_PASS: ''
        });
    });

    it('should use keyfile if provided', async () => {
        const dbMock = {
            getDefaultGroup: jest.fn().mockReturnValue(createMockGroup())
        };
        (mockKdbx.load as jest.Mock).mockResolvedValue(dbMock);
        
        // Mock readFileSync to instantiate separate buffers for db and keyfile
        mockFs.readFileSync.mockReturnValueOnce(Buffer.from('db-content'));
        mockFs.readFileSync.mockReturnValueOnce(Buffer.from('key-content'));

        await loadKdbxVariables('db.kdbx', 'pass', [], 'key.file');

        expect(mockFs.readFileSync).toHaveBeenCalledWith('db.kdbx');
        expect(mockFs.readFileSync).toHaveBeenCalledWith('key.file');
        // Verify 2nd arg to Credentials was passed (difficult to check exact buffer, but we can check calls)
        expect(kdbxweb.Credentials).toHaveBeenCalledTimes(1);
        const args = (kdbxweb.Credentials as unknown as jest.Mock).mock.calls[0];
        // 2nd arg should be the keyfile buffer
        expect(args[1]).toBeDefined();
    });

    it('should warn if variables are not found', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        const dbMock = {
            getDefaultGroup: jest.fn().mockReturnValue(createMockGroup())
        };
        (mockKdbx.load as jest.Mock).mockResolvedValue(dbMock);

        await loadKdbxVariables('db.kdbx', 'pass', ['MISSING_VAR']);

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Warning: Could not find the following variables')
        );
        consoleSpy.mockRestore();
    });

    it('should handle incorrect password errors explicitly', async () => {
        const error = new Error('HMAC mismatch');
        (mockKdbx.load as jest.Mock).mockRejectedValue(error);

        await expect(loadKdbxVariables('db.kdbx', 'wrongpass', []))
            .rejects
            .toThrow('Failed to decrypt KDBX file. Check your password or keyfile.');
    });

    it('should rethrow other errors', async () => {
        const error = new Error('Random FS error');
        mockFs.readFileSync.mockImplementation(() => { throw error; });

        await expect(loadKdbxVariables('db.kdbx', 'pass', []))
            .rejects
            .toThrow('Random FS error');
    });
});
