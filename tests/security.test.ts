import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFile = vi.fn();
vi.mock('child_process', () => ({ execFile, execFileSync: vi.fn(), execSync: vi.fn() }));

/** Makes the fake gpg finish, successfully or with the given error. */
const gpgAnswers = (error: Error | null = null, stderr: string = '') =>
    execFile.mockImplementation((_binary: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => callback(error, '', stderr));

describe('SecurityService', () => {
    let tmp: string;

    beforeEach(() => {
        execFile.mockReset();
        gpgAnswers();
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dischord-sec-'));
        process.env.GPG_IDENTITY = 'ABCDEF';
    });

    afterEach(() => {
        delete process.env.GPG_IDENTITY;
    });

    it('passes the file as a single argument, never through a shell', async () => {
        const { SecurityService } = await import('../src/utils/libraries/SecurityService');
        // Shell metacharacters that are still a legal file name on every platform.
        const evil = path.join(tmp, 'x; touch pwned; $(id) && echo.zip');
        fs.writeFileSync(evil, '');

        await SecurityService.signFile(evil);

        const [ binary, args, options ] = execFile.mock.calls[0];
        expect(binary).toBe('gpg');
        expect(args).toContain(evil);
        expect(args).toContain('ABCDEF');
        expect(args.slice(-3)).toEqual([ '--detach-sign', '--armor', evil ]);
        expect(options.shell).toBeFalsy();
        expect(options.timeout).toBeGreaterThan(0);
    });

    it('fails clearly when GPG_IDENTITY is missing', async () => {
        const { SecurityService } = await import('../src/utils/libraries/SecurityService');
        const file = path.join(tmp, 'a.zip');
        fs.writeFileSync(file, '');
        delete process.env.GPG_IDENTITY;

        await expect(SecurityService.signFile(file)).rejects.toThrow('GPG_IDENTITY');
        expect(execFile).not.toHaveBeenCalled();
    });

    it('wraps gpg failures without leaking their output', async () => {
        const { SecurityService } = await import('../src/utils/libraries/SecurityService');
        const file = path.join(tmp, 'a.zip');
        fs.writeFileSync(file, '');
        gpgAnswers(new Error('x'), 'no secret key /home/server/.gnupg');
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(SecurityService.signFile(file)).rejects.toThrow(/^Failed to sign package with GPG$/);
    });

    it('refuses to sign a file that does not exist', async () => {
        const { SecurityService } = await import('../src/utils/libraries/SecurityService');

        await expect(SecurityService.signFile(path.join(tmp, 'nope.zip'))).rejects.toThrow('not found');
        expect(execFile).not.toHaveBeenCalled();
    });
});
