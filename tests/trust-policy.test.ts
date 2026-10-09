import { describe, expect, it } from 'vitest';
import { TrustPolicy } from '../src/utils/libraries/TrustPolicy';
import { RepositoryData, TrustLevel } from '../src/utils/libraries/types';

const repo = (trustLevel: TrustLevel, allowedVersions: string[] = []) =>
    ({ name: 'x', description: '', githubUrl: 'o/x', versions: {}, trustLevel, allowedVersions }) as RepositoryData;

describe('TrustPolicy.isVersionAllowed', () => {
    it('allows any version for Trust and Official', () => {
        expect(TrustPolicy.isVersionAllowed(repo(TrustLevel.Trust), 'v9.9.9')).toBe(true);
        expect(TrustPolicy.isVersionAllowed(repo(TrustLevel.Official), 'v9.9.9')).toBe(true);
    });

    it('only allows whitelisted versions for Unknown', () => {
        const unknown = repo(TrustLevel.Unknown, [ 'v1.0.0' ]);
        expect(TrustPolicy.isVersionAllowed(unknown, 'v1.0.0')).toBe(true);
        expect(TrustPolicy.isVersionAllowed(unknown, 'v1.0.1')).toBe(false);
    });
});

describe('TrustPolicy signing rules', () => {
    it('signs automatically everything except Trust', () => {
        expect(TrustPolicy.signsOnDownload(TrustLevel.Official)).toBe(true);
        expect(TrustPolicy.signsOnDownload(TrustLevel.Unknown)).toBe(true);
        expect(TrustPolicy.signsOnDownload(TrustLevel.Trust)).toBe(false);
    });

    it('only audits Trust and above', () => {
        expect(TrustPolicy.canBeAudited(TrustLevel.Unknown)).toBe(false);
        expect(TrustPolicy.canBeAudited(TrustLevel.Trust)).toBe(true);
        expect(TrustPolicy.canBeAudited(TrustLevel.Official)).toBe(true);
    });
});

describe('TrustPolicy.parseLevel', () => {
    it('accepts names and aliases case-insensitively', () => {
        expect(TrustPolicy.parseLevel('O')).toBe(TrustLevel.Official);
        expect(TrustPolicy.parseLevel('trust')).toBe(TrustLevel.Trust);
        expect(TrustPolicy.parseLevel('Unknown')).toBe(TrustLevel.Unknown);
    });

    it('returns undefined for anything else', () => {
        expect(TrustPolicy.parseLevel('-')).toBeUndefined();
        expect(TrustPolicy.parseLevel('admin')).toBeUndefined();
    });
});
