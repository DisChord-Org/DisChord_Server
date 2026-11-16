import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeRemote, loadStorage } from './helpers';

const ZIP = 'zip-content';

/** Storage with one stored version of `ent`, and GPG replaced by a fake that writes a `.asc` file. */
const load = async (trustLevel: number, version: Record<string, unknown> = {}) => {
    const ctx = await loadStorage();
    const { ManifestService } = await import('../src/utils/libraries/ManifestService');
    const remote = fakeRemote(ctx);

    ctx.StorageService.saveRepos({
        ent: {
            name: 'ent', description: 'd', githubUrl: 'DisChord-Org/ent', trustLevel,
            ...(trustLevel === 0 ? { allowedVersions: [ 'v1.0.0' ] } : {}),
            versions: { 'v1.0.0': { tag: 'v1.0.0', isAudited: true, downloadUrl: 'u', createdAt: 1, ...version } }
        }
    } as any);
    ctx.StorageService.savePackageFiles('ent', 'v1.0.0', Buffer.from(ZIP));

    const zipPath = path.join(ctx.dir, 'downloaded', 'ent', 'v1.0.0', 'ent-v1.0.0.zip');

    return { ...ctx, ManifestService, remote, zipPath, sha256: ctx.SecurityService.hash(Buffer.from(ZIP)) };
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ManifestService', () => {
    it('signs a manifest with the name, version, hash, trust level and audit status', async () => {
        const { ManifestService, remote, zipPath, sha256 } = await load(2, { sha256: undefined });

        const signed = await ManifestService.getSigned('ent', 'v1.0.0');

        expect(JSON.parse(signed!.manifest)).toEqual({ schema: 1, name: 'ent', version: 'v1.0.0', sha256, trustLevel: 2, isAudited: true });
        expect(signed!.signature).toBe(`signature of ${signed!.manifest}`);
        expect(remote.sign).toHaveBeenCalledWith(`${zipPath}.manifest.json`);
    });

    it('records the hash of a version stored before hashes were kept', async () => {
        const { ManifestService, StorageService, sha256 } = await load(2);

        await ManifestService.getSigned('ent', 'v1.0.0');

        expect(StorageService.getRepo('ent')!.versions['v1.0.0'].sha256).toBe(sha256);
    });

    it('serves the cached manifest without signing again', async () => {
        const { ManifestService, remote } = await load(2);

        const first = await ManifestService.getSigned('ent', 'v1.0.0');
        const second = await ManifestService.getSigned('ent', 'v1.0.0');

        expect(second).toEqual(first);
        expect(remote.sign).toHaveBeenCalledTimes(1);
    });

    it('shares one signature between concurrent requests', async () => {
        const { ManifestService, remote } = await load(2);

        const [ first, second ] = await Promise.all([ ManifestService.getSigned('ent', 'v1.0.0'), ManifestService.getSigned('ent', 'v1.0.0') ]);

        expect(second).toEqual(first);
        expect(remote.sign).toHaveBeenCalledTimes(1);
    });

    it('signs a new manifest when the trust level or the audit status changes', async () => {
        const { ManifestService, StorageService, remote } = await load(1, { isAudited: false });

        expect(JSON.parse((await ManifestService.getSigned('ent', 'v1.0.0'))!.manifest)).toMatchObject({ trustLevel: 1, isAudited: false });

        StorageService.updateRepos(repos => { repos.ent.versions['v1.0.0'].isAudited = true; });
        expect(JSON.parse((await ManifestService.getSigned('ent', 'v1.0.0'))!.manifest)).toMatchObject({ trustLevel: 1, isAudited: true });

        StorageService.updateRepos(repos => { repos.ent.trustLevel = 2; });
        const promoted = await ManifestService.getSigned('ent', 'v1.0.0');
        expect(JSON.parse(promoted!.manifest)).toMatchObject({ trustLevel: 2, isAudited: true });
        expect(promoted!.signature).toBe(`signature of ${promoted!.manifest}`);

        expect(remote.sign).toHaveBeenCalledTimes(3);
    });

    it('discards a signature made while the registry was changing', async () => {
        const { ManifestService, StorageService, remote } = await load(1, { isAudited: false });

        remote.sign.mockImplementationOnce(async (file: string) => {
            fs.writeFileSync(`${file}.asc`, `signature of ${fs.readFileSync(file, 'utf-8')}`);
            StorageService.updateRepos(repos => { repos.ent.trustLevel = 2; });
        });

        const signed = await ManifestService.getSigned('ent', 'v1.0.0');

        expect(JSON.parse(signed!.manifest).trustLevel).toBe(2);
        expect(signed!.signature).toBe(`signature of ${signed!.manifest}`);
    });

    it('leaves no manifest behind when signing fails', async () => {
        const { ManifestService, remote, zipPath } = await load(2);
        remote.sign.mockRejectedValueOnce(new Error('Failed to sign package with GPG'));

        await expect(ManifestService.getSigned('ent', 'v1.0.0')).rejects.toThrow('Failed to sign');

        expect(fs.existsSync(`${zipPath}.manifest.json`)).toBe(false);
        expect(fs.existsSync(`${zipPath}.manifest.json.asc`)).toBe(false);
    });

    it('has no manifest for versions that are not stored', async () => {
        const { ManifestService, remote } = await load(2);

        expect(await ManifestService.getSigned('ent', 'v9.9.9')).toBeNull();
        expect(await ManifestService.getSigned('nope', 'v1.0.0')).toBeNull();
        expect(remote.sign).not.toHaveBeenCalled();
    });
});
