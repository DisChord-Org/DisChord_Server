import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { loadStorage } from './helpers';

const ADMIN = '111111111111111111';
const ADMIN2 = '222222222222222222';
const CONTRIB = '333333333333333333';

const load = async () => {
    const ctx = await loadStorage();
    const { default: TrustUsersService } = await import('../src/utils/libraries/TrustUsersService');
    const actions = await import('../src/utils/trust/actions');
    const handlers = await import('../src/utils/trust/handlers');
    const views = await import('../src/utils/trust/views');

    TrustUsersService.addUser({ id: ADMIN, role: 0, allowedRepos: [], createdAt: 1 });
    TrustUsersService.addUser({ id: CONTRIB, role: 1, allowedRepos: [ 'ent' ], createdAt: 2 });
    ctx.StorageService.saveRepos({
        ent: { name: 'ent', description: 'd', githubUrl: 'o/ent', trustLevel: 2, versions: {} },
        otro: { name: 'otro', description: 'd', githubUrl: 'o/otro', trustLevel: 2, versions: {} }
    } as any);

    return { ...ctx, TrustUsersService, ...actions, ...handlers, ...views };
};

describe('role checks (a contributor must never run admin actions)', () => {
    it('blocks every admin action for contributors', async () => {
        const { addTrustUser, removeTrustUser, allowRepoToUser, TrustUsersService } = await load();

        expect(() => addTrustUser(CONTRIB, ADMIN2, 0)).toThrow('permiso');
        expect(() => removeTrustUser(CONTRIB, ADMIN)).toThrow('permiso');
        expect(() => allowRepoToUser(CONTRIB, CONTRIB, 'otro')).toThrow('permiso');
        expect(TrustUsersService.getUser(ADMIN2)).toBeNull();
        expect(TrustUsersService.getUser(CONTRIB)!.allowedRepos).toEqual([ 'ent' ]);
    });

    it('rejects people who are not trust users at all', async () => {
        const { addTrustUser } = await load();

        expect(() => addTrustUser('999999999999999999', ADMIN2, 0)).toThrow('validado');
    });

    it('marks exactly the management commands as admin-only', async () => {
        const { trustHandlers } = await load();
        const adminOnly = trustHandlers.filter(h => h.adminOnly).flatMap(h => h.names).sort();

        expect(adminOnly).toEqual([ 'add-user', 'addusr', 'allow-repo', 'delete-user', 'delusr', 'llr' ]);
    });
});

describe('user management', () => {
    it('admins add users with a valid id only', async () => {
        const { addTrustUser, TrustUsersService } = await load();

        expect(addTrustUser(ADMIN, ADMIN2, 0)).toContain('(adm)');
        expect(TrustUsersService.getUser(ADMIN2)!.role).toBe(0);
        expect(() => addTrustUser(ADMIN, ADMIN2, 1)).toThrow('ya existe');
        expect(() => addTrustUser(ADMIN, '../../evil', 0)).toThrow('no es válido');
        expect(() => addTrustUser(ADMIN, 'abc', 0)).toThrow('no es válido');
    });

    it('does not let ids escape the users directory', async () => {
        const { TrustUsersService, dir } = await load();

        expect(TrustUsersService.getUser('../AvailableRepos')).toBeNull();
        expect(() => TrustUsersService.addUser({ id: '../x', role: 0, allowedRepos: [], createdAt: 1 })).toThrow();
        expect(fs.existsSync(path.join(dir, 'x.json'))).toBe(false);
    });

    it('never removes yourself or the last administrator', async () => {
        const { addTrustUser, removeTrustUser, TrustUsersService } = await load();

        expect(() => removeTrustUser(ADMIN, ADMIN)).toThrow('a ti mismo');

        addTrustUser(ADMIN, ADMIN2, 0);
        expect(removeTrustUser(ADMIN2, ADMIN)).toContain('eliminado');
        expect(() => removeTrustUser(ADMIN2, ADMIN2)).toThrow('a ti mismo');
        expect(TrustUsersService.getUsers().map(u => u.id).sort()).toEqual([ CONTRIB, ADMIN2 ].sort());
    });

    it('allows a repository once, only if both exist', async () => {
        const { allowRepoToUser, TrustUsersService } = await load();

        expect(allowRepoToUser(ADMIN, CONTRIB, 'otro')).toContain('otro');
        expect(TrustUsersService.getUser(CONTRIB)!.allowedRepos).toEqual([ 'ent', 'otro' ]);
        expect(() => allowRepoToUser(ADMIN, CONTRIB, 'otro')).toThrow('ya tiene');
        expect(() => allowRepoToUser(ADMIN, CONTRIB, 'nada')).toThrow('No existe el repositorio');
        expect(() => allowRepoToUser(ADMIN, '444444444444444444', 'ent')).toThrow('No existe el usuario');
    });

    it('keeps the profile file format and leaves no temporary files', async () => {
        const { TrustUsersService } = await load();

        TrustUsersService.allowRepositoryToUser(CONTRIB, 'otro');

        const file = path.join(TrustUsersService.UsersDir, `${CONTRIB}.json`);
        expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ id: CONTRIB, role: 1, allowedRepos: [ 'ent', 'otro' ], createdAt: 2 });
        expect(fs.readdirSync(TrustUsersService.UsersDir).filter(f => !f.endsWith('.json'))).toEqual([]);
    });
});

describe('registerLatestVersion', () => {
    it('lets contributors register only repositories they were given', async () => {
        const { registerLatestVersion, LibraryManager } = await load();
        const spy = vi.spyOn(LibraryManager, 'registerAndDownload').mockResolvedValue();

        await expect(registerLatestVersion(CONTRIB, 'otro')).rejects.toThrow('No puedes');
        expect(spy).not.toHaveBeenCalled();

        await expect(registerLatestVersion(CONTRIB, 'ent')).resolves.toContain('registrada');
        await expect(registerLatestVersion(ADMIN, 'otro')).resolves.toContain('registrada');
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('reports download failures instead of ignoring them', async () => {
        const { registerLatestVersion, LibraryManager } = await load();
        vi.spyOn(LibraryManager, 'registerAndDownload').mockRejectedValue(new Error('GitHub caído'));

        await expect(registerLatestVersion(ADMIN, 'ent')).rejects.toThrow('GitHub caído');
    });
});

describe('manageableRepos', () => {
    it('shows every package to admins and only the allowed ones to contributors', async () => {
        const { manageableRepos } = await load();

        expect(manageableRepos(ADMIN).map(r => r.name)).toEqual([ 'ent', 'otro' ]);
        expect(manageableRepos(CONTRIB).map(r => r.name)).toEqual([ 'ent' ]);
        expect(manageableRepos('999999999999999999')).toEqual([]);
    });
});

describe('trust views', () => {
    it('stay inside Discord limits', async () => {
        const { addUserModal, allowRepoModal, registerModal, adminActions, contributorActions, TrustId } = await load();
        const user = { id: ADMIN, role: 0, allowedRepos: [ 'ent' ], createdAt: 1 } as any;
        const many = Array.from({ length: 40 }, (_, i) => `pkg${i}`);

        for (const modal of [ addUserModal(), allowRepoModal(user, many)!, registerModal(many)! ]) {
            const json = modal.toJSON() as any;
            expect(json.title.length).toBeLessThanOrEqual(45);
            expect(json.components.length).toBeLessThanOrEqual(5);
            json.components.forEach((c: any) => {
                expect(c.label.length).toBeLessThanOrEqual(45);
                if (c.component.options) expect(c.component.options.length).toBeLessThanOrEqual(25);
            });
        }

        const ids = adminActions().map(b => (b.toJSON() as any).custom_id);
        expect(new Set(ids).size).toBe(4);
        expect(ids).toContain(TrustId.Register);
        expect(contributorActions().filter(Boolean)).toHaveLength(1);
    });

    it('has nothing to offer when every package is already allowed or none exist', async () => {
        const { allowRepoModal, registerModal } = await load();

        expect(allowRepoModal({ id: ADMIN, role: 0, allowedRepos: [ 'ent' ], createdAt: 1 } as any, [ 'ent' ])).toBeUndefined();
        expect(registerModal([])).toBeUndefined();
    });

    it('marks the selected user and shows their packages', async () => {
        const { formatUsers } = await load();
        const users = [
            { id: ADMIN, role: 0, allowedRepos: [], createdAt: 1 },
            { id: CONTRIB, role: 1, allowedRepos: [ 'ent' ], createdAt: 2 }
        ] as any[];

        const text = formatUsers(users, { page: 1, totalPages: 1, totalItems: 2, selectedIndex: 1, firstIndex: 0 });

        expect(text).toContain(`• \`${ADMIN}\` · Adm · 0 paquetes`);
        expect(text).toContain(`▸ \`${CONTRIB}\` · Contrib · 1 paquete`);
        expect(text).toContain('`ent`');
    });
});
