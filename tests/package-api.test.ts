import { describe, expect, it, vi } from 'vitest';
import { loadStorage } from './helpers';

const fakeRes = () => {
    const res: any = { locals: {}, statusCode: 200, body: undefined };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (body: unknown) => { res.body = body; return res; };
    return res;
};

const seed = async () => {
    const ctx = await loadStorage();
    ctx.StorageService.saveRepos({
        ent: { name: 'ent', description: 'd', githubUrl: 'o/ent', trustLevel: 2, versions: { 'v1.0.0': { tag: 'v1.0.0', isAudited: true, downloadUrl: 'u', createdAt: 1 } } }
    } as any);
    ctx.StorageService.savePackageFiles('ent', 'v1.0.0', Buffer.from('z'));
    const { resolvePackage } = await import('../src/server/middlewares/package.middleware');
    const { toPackageResponse } = await import('../src/server/presenters/package.presenter');
    return { ...ctx, resolvePackage, toPackageResponse };
};

describe('resolvePackage middleware', () => {
    it('rejects invalid versions with 400', async () => {
        const { resolvePackage } = await seed();
        const res = fakeRes(); const next = vi.fn();

        await resolvePackage()({ params: { repo: 'ent', version: 'latest' } } as any, res, next);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Version is not valid' });
        expect(next).not.toHaveBeenCalled();
    });

    it('uses the given message when the package is not registered', async () => {
        const { resolvePackage } = await seed();
        const res = fakeRes();

        await resolvePackage('Package not found in registry')({ params: { repo: 'nope', version: 'v1.0.0' } } as any, res, vi.fn());

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: 'Package not found in registry' });
    });

    it('answers 404 when the version is not stored', async () => {
        const { resolvePackage } = await seed();
        const res = fakeRes();

        await resolvePackage()({ params: { repo: 'ent', version: 'v9.9.9' } } as any, res, vi.fn());

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: 'No version available' });
    });

    it('stores the package and tag for the controller', async () => {
        const { resolvePackage } = await seed();
        const res = fakeRes(); const next = vi.fn();

        await resolvePackage()({ params: { repo: 'ent', version: 'v1.0.0' } } as any, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.locals.package.tag).toBe('v1.0.0');
        expect(res.locals.package.pkg.name).toBe('ent');
    });
});

describe('toPackageResponse', () => {
    it('keeps the public JSON shape', async () => {
        const { StorageService, toPackageResponse } = await seed();

        expect(toPackageResponse(StorageService.getRepo('ent')!, 'v1.0.0')).toEqual({
            name: 'ent', description: 'd', trustLevel: 2, repository: 'o/ent', version: 'v1.0.0', isAudited: true,
            versions: { 'v1.0.0': { tag: 'v1.0.0', isAudited: true, downloadUrl: 'u', createdAt: 1 } }
        });
    });

    it('reports no version and not audited when nothing is downloaded', async () => {
        const { StorageService, toPackageResponse } = await seed();

        const response = toPackageResponse(StorageService.getRepo('ent')!, null);
        expect(response.version).toBeNull();
        expect(response.isAudited).toBe(false);
    });
});
