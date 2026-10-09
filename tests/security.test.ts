import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
vi.mock('child_process', () => ({ execFileSync, execSync: vi.fn() }));

describe('SecurityService', () => {
    let tmp: string;

    beforeEach(() => {
        execFileSync.mockReset();
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dischord-sec-'));
        process.env.GPG_IDENTITY = 'ABCDEF';
    });

    afterEach(() => {
        delete process.env.GPG_IDENTITY;
    });

    it('passes the file as a single argument, never through a shell', async () => {
        const { SecurityService } = await import('../src/utils/libraries/SecurityService');
        const evil = path.join(tmp, 'x"; touch pwned; ".zip');
        fs.writeFileSync(evil, '');

        SecurityService.signFile(evil);

        const [ binary, args ] = execFileSync.mock.calls[0];
        expect(binary).toBe('gpg');
        expect(args).toContain(evil);
        expect(args).toContain('ABCDEF');
        expect(args.slice(-3)).toEqual([ '--detach-sign', '--armor', evil ]);
    });

    it('fails clearly when GPG_IDENTITY is missing', async () => {
        const { SecurityService } = await import('../src/utils/libraries/SecurityService');
        const file = path.join(tmp, 'a.zip');
        fs.writeFileSync(file, '');
        delete process.env.GPG_IDENTITY;

        expect(() => SecurityService.signFile(file)).toThrow('GPG_IDENTITY');
        expect(execFileSync).not.toHaveBeenCalled();
    });

    it('wraps gpg failures', async () => {
        const { SecurityService } = await import('../src/utils/libraries/SecurityService');
        const file = path.join(tmp, 'a.zip');
        fs.writeFileSync(file, '');
        execFileSync.mockImplementation(() => { throw Object.assign(new Error('x'), { stderr: Buffer.from('no key') }); });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => SecurityService.signFile(file)).toThrow('Failed to sign package with GPG');
    });
});
