import { describe, expect, it } from 'vitest';
import { loadStorage } from './helpers';

/** Mirrors how the command invokes handlers: inside an async context, so sync throws become rejections. */
const call = async (handler: { run(args: string[]): unknown } | undefined, args: string[]) => handler!.run(args);

const official = (extra = {}) => ({
    name: 'ent', description: 'desc', githubUrl: 'DisChord-Org/ent', trustLevel: 2,
    versions: { 'v1.0.0': { tag: 'v1.0.0', isAudited: true, downloadUrl: 'u', createdAt: 1 } },
    ...extra
});

describe('pkg md (modify)', () => {
    it('keeps versions and the current level when given "-"', async () => {
        const { StorageService, findPkgHandler } = await loadStorage();
        StorageService.saveRepos({ ent: official() } as any);

        const answer = await findPkgHandler('md')!.run([ 'md', 'ent', '-', '-', 'nueva', 'descripción' ]);

        const repo = StorageService.getRepo('ent') as any;
        expect(answer).toContain('modificado');
        expect(repo.trustLevel).toBe(2);
        expect(repo.description).toBe('nueva descripción');
        expect(repo.githubUrl).toBe('DisChord-Org/ent');
        expect(Object.keys(repo.versions)).toEqual([ 'v1.0.0' ]);
        expect(repo.allowedVersions).toBeUndefined();
    });

    it('keeps the whitelist of an Unknown package that stays Unknown', async () => {
        const { StorageService, findPkgHandler } = await loadStorage();
        StorageService.saveRepos({ ent: official({ trustLevel: 0, allowedVersions: [ 'v1.0.0' ] }) } as any);

        await findPkgHandler('md')!.run([ 'md', 'ent', 'u', '-', '-' ]);

        expect((StorageService.getRepo('ent') as any).allowedVersions).toEqual([ 'v1.0.0' ]);
    });

    it('adds an empty whitelist when moving to Unknown and drops it when leaving', async () => {
        const { StorageService, findPkgHandler } = await loadStorage();
        StorageService.saveRepos({ ent: official() } as any);

        await findPkgHandler('md')!.run([ 'md', 'ent', 'unknown', '-', '-' ]);
        expect((StorageService.getRepo('ent') as any).allowedVersions).toEqual([]);

        await findPkgHandler('md')!.run([ 'md', 'ent', 't', '-', '-' ]);
        const repo = StorageService.getRepo('ent') as any;
        expect(repo.trustLevel).toBe(1);
        expect('allowedVersions' in repo).toBe(false);
    });

    it('rejects an invalid level instead of silently lowering trust', async () => {
        const { StorageService, findPkgHandler, UserError } = await loadStorage();
        StorageService.saveRepos({ ent: official() } as any);

        await expect(call(findPkgHandler('md'), [ 'md', 'ent', 'oficial', '-', '-' ])).rejects.toBeInstanceOf(UserError);
        expect((StorageService.getRepo('ent') as any).trustLevel).toBe(2);
    });
});

describe('pkg handlers', () => {
    it('resolves aliases and is case-insensitive', async () => {
        const { findPkgHandler } = await loadStorage();

        expect(findPkgHandler('LST')).toBe(findPkgHandler('list'));
        expect(findPkgHandler('illw')).toBe(findPkgHandler('is-allowed'));
        expect(findPkgHandler('nope')).toBeUndefined();
    });

    it('add refuses to overwrite an existing package', async () => {
        const { StorageService, findPkgHandler, UserError } = await loadStorage();
        StorageService.saveRepos({ ent: official() } as any);

        await expect(call(findPkgHandler('add'), [ 'add', 'ent', 'o', 'DisChord-Org/ent', 'd' ])).rejects.toBeInstanceOf(UserError);
        expect(Object.keys((StorageService.getRepo('ent') as any).versions)).toEqual([ 'v1.0.0' ]);
    });

    it('add refuses names that are unsafe as folders', async () => {
        const { findPkgHandler, UserError } = await loadStorage();

        await expect(call(findPkgHandler('add'), [ 'add', '../x', 'o', 'a/b', 'd' ])).rejects.toBeInstanceOf(UserError);
    });

    it('sg reports a missing package instead of failing silently', async () => {
        const { findPkgHandler, UserError } = await loadStorage();

        await expect(call(findPkgHandler('sg'), [ 'sg', 'nada', 'v1.0.0' ])).rejects.toBeInstanceOf(UserError);
    });

    it('lists packages filtered by prefix', async () => {
        const { StorageService, findPkgHandler } = await loadStorage();
        StorageService.saveRepos({ ent: official(), otro: official({ name: 'otro', description: 'zzz' }) } as any);

        const answer = await findPkgHandler('lst')!.run([ 'lst', 'en' ]);

        expect(answer).toContain('ent (Official)');
        expect(answer).not.toContain('otro');
    });

    it('llw only works on Unknown packages', async () => {
        const { StorageService, findPkgHandler, UserError } = await loadStorage();
        StorageService.saveRepos({ ent: official() } as any);

        await expect(call(findPkgHandler('llw'), [ 'llw', 'ent', 'v2.0.0' ])).rejects.toBeInstanceOf(UserError);
    });
});

describe('LibraryManager', () => {
    it('deleteRepository removes the record and its folder only when it exists', async () => {
        const { StorageService, LibraryManager } = await loadStorage();
        StorageService.saveRepos({ ent: official() } as any);
        StorageService.savePackageFiles('ent', 'v1.0.0', Buffer.from('z'));

        LibraryManager.deleteRepository('nada');
        expect(Object.keys(StorageService.getRepos())).toEqual([ 'ent' ]);

        LibraryManager.deleteRepository('ent');
        expect(StorageService.getRepos()).toEqual({});
        expect(StorageService.getLocalVersionFolders('ent')).toEqual([]);
    });

    it('getVersion returns the highest semver and ignores non-semver folders', async () => {
        const { StorageService, LibraryManager } = await loadStorage();
        StorageService.saveRepos({ ent: official() } as any);
        for (const tag of [ 'v1.0.0', 'v1.10.0', 'v1.2.0', 'notes' ]) StorageService.savePackageFiles('ent', tag, Buffer.from(''));

        expect(await LibraryManager.getVersion('ent')).toBe('v1.10.0');
        expect(await LibraryManager.getVersion('ent', 'v1.2.0')).toBe('v1.2.0');
        expect(await LibraryManager.getVersion('ent', 'v9.0.0')).toBeNull();
    });

    it('updateRepositoryMetadata fails for unknown repositories', async () => {
        const { LibraryManager } = await loadStorage();

        expect(() => LibraryManager.updateRepositoryMetadata(official() as any)).toThrow('no encontrado');
    });
});
