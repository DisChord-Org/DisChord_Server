import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadStorage } from './helpers';

describe('StorageService', () => {
    it('creates the same structure as before', async () => {
        const { dir, StorageService } = await loadStorage();

        expect(fs.existsSync(path.join(dir, 'downloaded'))).toBe(true);
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'AvailableRepos.json'), 'utf-8'))).toEqual({});
        expect(StorageService.getRepos()).toEqual({});
    });

    it('stores packages as downloaded/<repo>/<tag>/<repo>-<tag>.zip with version.txt', async () => {
        const { dir, StorageService } = await loadStorage();

        StorageService.savePackageFiles('ent', 'v1.0.0', Buffer.from('zip'));

        expect(fs.readFileSync(path.join(dir, 'downloaded/ent/v1.0.0/ent-v1.0.0.zip'), 'utf-8')).toBe('zip');
        expect(fs.readFileSync(path.join(dir, 'downloaded/ent/v1.0.0/version.txt'), 'utf-8')).toBe('v1.0.0');
        expect(StorageService.getZipPath('ent', 'v1.0.0')).toBe(path.join(dir, 'downloaded/ent/v1.0.0/ent-v1.0.0.zip'));
        expect(StorageService.getLocalVersionFolders('ent')).toEqual([ 'v1.0.0' ]);
    });

    it('writes the registry with 4-space indentation and leaves no temporary file', async () => {
        const { dir, StorageService } = await loadStorage();

        StorageService.saveRepos({ a: { name: 'a' } } as any);

        expect(fs.readFileSync(path.join(dir, 'AvailableRepos.json'), 'utf-8')).toBe(JSON.stringify({ a: { name: 'a' } }, null, 4));
        expect(fs.existsSync(path.join(dir, 'AvailableRepos.json.tmp'))).toBe(false);
    });

    it('updateRepos mutates the freshly read registry and keeps unknown fields', async () => {
        const { StorageService } = await loadStorage();
        StorageService.saveRepos({ a: { name: 'a', versions: { 'v1.0.0': { tag: 'v1.0.0', signature: 'sig' } } } } as any);

        StorageService.updateRepos(repos => { (repos as any).b = { name: 'b' }; });

        const repos = StorageService.getRepos() as any;
        expect(repos.b).toEqual({ name: 'b' });
        expect(repos.a.versions['v1.0.0'].signature).toBe('sig');
    });

    it('does not save when the mutator throws', async () => {
        const { StorageService } = await loadStorage();
        StorageService.saveRepos({ a: { name: 'a' } } as any);

        expect(() => StorageService.updateRepos(() => { throw new Error('boom'); })).toThrow('boom');
        expect(Object.keys(StorageService.getRepos())).toEqual([ 'a' ]);
    });

    it('rejects names that could escape the storage directory', async () => {
        const { StorageService } = await loadStorage();

        for (const bad of [ '..', '.', '', 'a/b', '../x', 'a\\b', 'a\0b' ]) {
            expect(() => StorageService.assertSafeSegment(bad), JSON.stringify(bad)).toThrow();
        }
        expect(() => StorageService.savePackageFiles('../evil', 'v1.0.0', Buffer.from(''))).toThrow();
        expect(() => StorageService.savePackageFiles('ent', '../../x', Buffer.from(''))).toThrow();
        expect(StorageService.assertSafeSegment('v1.0.0+build')).toBe('v1.0.0+build');
    });
});
