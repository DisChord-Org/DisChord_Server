import { describe, expect, it } from 'vitest';
import { loadStorage } from './helpers';

const repo = (name: string, extra: Record<string, unknown> = {}) => ({
    name, description: `desc ${name}`, githubUrl: `DisChord-Org/${name}`, trustLevel: 2,
    versions: { 'v1.0.0': { tag: 'v1.0.0', isAudited: true, downloadUrl: 'u', createdAt: 1 } },
    ...extra
});

const load = async () => {
    const ctx = await loadStorage();
    const views = await import('../src/utils/pkg/views');
    return { ...ctx, ...views };
};

/** Every limit Discord enforces on modals and selects, checked on the JSON that would be sent. */
const checkModalLimits = (json: any) => {
    expect(json.title.length).toBeLessThanOrEqual(45);
    expect(json.custom_id.length).toBeLessThanOrEqual(100);
    expect(json.components.length).toBeLessThanOrEqual(5);

    for (const label of json.components) {
        expect(label.label.length).toBeLessThanOrEqual(45);
        const input = label.component;
        expect(input.custom_id.length).toBeLessThanOrEqual(100);
        if (input.options) {
            expect(input.options.length).toBeGreaterThan(0);
            expect(input.options.length).toBeLessThanOrEqual(25);
            for (const option of input.options) {
                expect(option.label.length).toBeLessThanOrEqual(100);
                expect(option.value.length).toBeLessThanOrEqual(100);
                if (option.description) expect(option.description.length).toBeLessThanOrEqual(100);
            }
        }
    }
};

describe('panel text', () => {
    it('marks the selected package and shows its details', async () => {
        const { StorageService, formatPage, sortedRepos } = await load();
        StorageService.saveRepos({ b: repo('b'), a: repo('a') } as any);
        StorageService.savePackageFiles('a', 'v1.0.0', Buffer.from(''));

        const repos = sortedRepos();
        const text = formatPage(repos, { page: 1, totalPages: 1, totalItems: 2, selectedIndex: 0, firstIndex: 0 });

        expect(repos.map(r => r.name)).toEqual([ 'a', 'b' ]);
        expect(text).toContain('▸ **a** · Official · `v1.0.0`');
        expect(text).toContain('• **b** · Official · `sin descargar`');
        expect(text).toContain('### a');
        expect(text).not.toContain('### b');
    });

    it('lists whitelisted versions only for Unknown packages', async () => {
        const { formatDetail } = await load();

        expect(formatDetail(repo('x', { trustLevel: 0, allowedVersions: [ 'v1.0.0', 'v2.0.0' ] }) as any)).toContain('`v1.0.0`, `v2.0.0`');
        expect(formatDetail(repo('x') as any)).not.toContain('permitidas');
    });

    it('orders local versions by semver, newest first, ignoring non-semver folders', async () => {
        const { StorageService, localVersions } = await load();
        for (const tag of [ 'v1.2.0', 'v1.10.0', 'v1.9.0', 'notes' ]) StorageService.savePackageFiles('a', tag, Buffer.from(''));

        expect(localVersions('a')).toEqual([ 'v1.10.0', 'v1.9.0', 'v1.2.0' ]);
    });
});

describe('modals', () => {
    it('modify modal respects Discord limits and preselects the current level', async () => {
        const { modifyModal } = await load();
        const json = modifyModal(repo('x', { trustLevel: 1 }) as any).toJSON() as any;

        checkModalLimits(json);
        const select = json.components.at(-1).component;
        expect(select.options.filter((o: any) => o.default).map((o: any) => o.value)).toEqual([ 'trust' ]);
        expect(json.components[0].component.value).toBe('desc x');
    });

    it('add modal asks for name, repository, description and level', async () => {
        const { addModal } = await load();
        const json = addModal().toJSON() as any;

        checkModalLimits(json);
        expect(json.components.map((c: any) => c.component.custom_id)).toEqual([ 'name', 'githubUrl', 'description', 'level' ]);
        expect(json.components[2].component.required).toBe(false);
    });

    it('allow modal truncates long package names in the title', async () => {
        const { allowModal } = await load();

        checkModalLimits(allowModal(repo('a'.repeat(80), { trustLevel: 0, allowedVersions: [] }) as any).toJSON());
    });

    it('sign modal offers local versions (max 25) with the newest selected, or nothing to sign', async () => {
        const { StorageService, signModal } = await load();
        StorageService.saveRepos({ a: repo('a') } as any);

        expect(signModal(repo('a') as any)).toBeUndefined();

        for (let i = 0; i < 30; i++) StorageService.savePackageFiles('a', `v1.${i}.0`, Buffer.from(''));
        const json = signModal(repo('a') as any)!.toJSON() as any;

        checkModalLimits(json);
        const options = json.components[0].component.options;
        expect(options).toHaveLength(25);
        expect(options[0].value).toBe('v1.29.0');
        expect(options[0].default).toBe(true);
    });
});

describe('panel buttons', () => {
    it('keeps custom ids unique and short', async () => {
        const { PkgId, panelActions, moreMenu, deleteConfirmation } = await load();
        const { Button } = await import('seyfert');
        const back = new Button().setCustomId('pagination:back').setLabel('Volver');

        const buttons = [
            ...panelActions(),
            ...(moreMenu(repo('a') as any, back).components[0].toJSON() as any).components,
            ...(deleteConfirmation(repo('a') as any).components[0].toJSON() as any).components
        ].map((b: any) => (b.toJSON ? b.toJSON() : b));
        const ids = buttons.map((b: any) => b.custom_id);

        expect(new Set(ids).size).toBe(ids.length);
        ids.forEach((id: string) => expect(id.length).toBeLessThanOrEqual(100));
        expect(Object.values(PkgId).every(id => ids.includes(id))).toBe(true);
    });

    it('disables "permitir versión" unless the package is Unknown', async () => {
        const { moreMenu } = await load();
        const { Button } = await import('seyfert');
        const back = () => new Button().setCustomId('pagination:back').setLabel('Volver');
        const allow = (r: any) => (moreMenu(r, back()).components[0].toJSON() as any).components[0];

        expect(allow(repo('a')).disabled).toBe(true);
        expect(allow(repo('a', { trustLevel: 0, allowedVersions: [] })).disabled).toBeFalsy();
    });
});
