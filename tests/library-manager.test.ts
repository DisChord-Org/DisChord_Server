import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeRemote, loadStorage } from './helpers';

const repo = (trustLevel: number, extra: Record<string, unknown> = {}) => ({
    name: 'ent', description: 'desc', githubUrl: 'DisChord-Org/ent', trustLevel, versions: {},
    ...(trustLevel === 0 ? { allowedVersions: [] as string[] } : {}),
    ...extra
}) as any;

const load = async (trustLevel: number, extra: Record<string, unknown> = {}) => {
    const ctx = await loadStorage();
    ctx.StorageService.saveRepos({ ent: repo(trustLevel, extra) });
    const actions = await import('../src/utils/pkg/actions');

    return { ...ctx, ...actions, remote: fakeRemote(ctx) };
};

const zipOf = (dir: string, tag: string) => path.join(dir, 'downloaded', 'ent', tag, `ent-${tag}.zip`);
const staged = (dir: string) => fs.readdirSync(path.join(dir, '.staging'));

afterEach(() => {
    vi.restoreAllMocks();
});

describe('download and signing', () => {
    it('stores an Official release signed, with its hash, and leaves nothing staged', async () => {
        const { dir, StorageService, LibraryManager, SecurityService } = await load(2);

        await LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);

        const version = StorageService.getRepo('ent')!.versions['v1.0.0'];
        expect(fs.readFileSync(zipOf(dir, 'v1.0.0'), 'utf-8')).toBe('zip-original');
        expect(fs.existsSync(`${zipOf(dir, 'v1.0.0')}.asc`)).toBe(true);
        expect(version.isAudited).toBe(true);
        expect(version.sha256).toBe(SecurityService.hash(Buffer.from('zip-original')));
        expect(staged(dir)).toEqual([]);
    });

    it('never downloads or signs again a tag that is already stored, even if the tag was moved', async () => {
        const { dir, StorageService, LibraryManager, remote } = await load(2);
        await LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);

        remote.zip.content = 'zip-malicious';
        await expect(LibraryManager.registerAndDownload(StorageService.getRepo('ent')!)).rejects.toThrow('no se puede reemplazar');

        expect(fs.readFileSync(zipOf(dir, 'v1.0.0'), 'utf-8')).toBe('zip-original');
        expect(fs.readFileSync(`${zipOf(dir, 'v1.0.0')}.asc`, 'utf-8')).toBe('signature of zip-original');
        expect(remote.sign).toHaveBeenCalledTimes(1);
        expect(remote.download).toHaveBeenCalledTimes(1);
    });

    it('a whitelisted tag of an Unknown package cannot be replaced by a contributor either', async () => {
        const { dir, StorageService, LibraryManager, remote } = await load(0);
        await LibraryManager.allowAndDownloadVersion('ent', 'v1.0.0');

        remote.zip.content = 'zip-malicious';
        await expect(LibraryManager.registerAndDownload(StorageService.getRepo('ent')!)).rejects.toThrow('no se puede reemplazar');
        await expect(LibraryManager.allowAndDownloadVersion('ent', 'v1.0.0')).rejects.toThrow('no se puede reemplazar');

        expect(fs.readFileSync(zipOf(dir, 'v1.0.0'), 'utf-8')).toBe('zip-original');
        expect(remote.sign).toHaveBeenCalledTimes(1);
    });

    it('leaves no version, signature or registry entry when signing fails', async () => {
        const { dir, StorageService, LibraryManager, remote } = await load(2);
        remote.sign.mockRejectedValueOnce(new Error('Failed to sign package with GPG'));

        await expect(LibraryManager.registerAndDownload(StorageService.getRepo('ent')!)).rejects.toThrow('GPG');

        expect(StorageService.getLocalVersionFolders('ent')).toEqual([]);
        expect(await LibraryManager.getVersion('ent')).toBeNull();
        expect(StorageService.getRepo('ent')!.versions).toEqual({});
        expect(staged(dir)).toEqual([]);

        // Nothing was left behind, so the same tag can be tried again.
        await LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);
        expect(StorageService.getRepo('ent')!.versions['v1.0.0'].isAudited).toBe(true);
    });

    it('leaves nothing behind when the download fails', async () => {
        const { dir, StorageService, LibraryManager, remote } = await load(2);
        remote.download.mockRejectedValueOnce(new Error('GitHub caído'));

        await expect(LibraryManager.registerAndDownload(StorageService.getRepo('ent')!)).rejects.toThrow('GitHub caído');

        expect(StorageService.getLocalVersionFolders('ent')).toEqual([]);
        expect(staged(dir)).toEqual([]);
    });

    it('refuses to process the same version twice at the same time', async () => {
        const { StorageService, LibraryManager, remote } = await load(2);
        let release!: () => void;
        remote.download.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(Buffer.from('zip-original')); }));

        const first = LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        await expect(LibraryManager.registerAndDownload(StorageService.getRepo('ent')!)).rejects.toThrow('ya se está descargando');

        release();
        await first;
        expect(remote.sign).toHaveBeenCalledTimes(1);
    });

    it('keeps what changed in the registry while GitHub was answering', async () => {
        const { StorageService, LibraryManager, remote } = await load(2);
        const stale = StorageService.getRepo('ent')!;

        // Staff lowers the package to Trust while the contributor's download is still talking to GitHub.
        remote.fetchRelease.mockImplementationOnce(async () => {
            StorageService.updateRepos(repos => { (repos.ent as any).trustLevel = 1; repos.ent.description = 'cambiada'; });
            return { tag_name: 'v1.0.0', zipball_url: 'https://api.github.com/repos/DisChord-Org/ent/zipball/v1.0.0' };
        });

        await LibraryManager.registerAndDownload(stale);

        const current = StorageService.getRepo('ent')!;
        expect(current.trustLevel).toBe(1);
        expect(current.description).toBe('cambiada');
        expect(current.versions['v1.0.0'].isAudited).toBe(false);
        expect(remote.sign).not.toHaveBeenCalled();
    });
});

describe('Trust packages wait for a manual audit', () => {
    it('are stored unsigned, and "up" does not sign them', async () => {
        const { dir, StorageService, LibraryManager, updatePackage, remote } = await load(1);
        await LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);
        expect(StorageService.getRepo('ent')!.versions['v1.0.0'].isAudited).toBe(false);

        remote.remote.latest = 'v1.1.0';
        const answer = await updatePackage('ent');

        expect(answer).toContain('ent@v1.0.0 -> ent@v1.1.0');
        expect(answer).toContain('Pendiente de auditoría');
        expect(StorageService.getRepo('ent')!.versions['v1.1.0'].isAudited).toBe(false);
        expect(fs.existsSync(`${zipOf(dir, 'v1.1.0')}.asc`)).toBe(false);
        expect(remote.sign).not.toHaveBeenCalled();
    });

    it('sg signs the stored ZIP and marks it audited', async () => {
        const { dir, StorageService, LibraryManager } = await load(1);
        await LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);

        await LibraryManager.auditAndSign('ent', 'v1.0.0');

        expect(StorageService.getRepo('ent')!.versions['v1.0.0'].isAudited).toBe(true);
        expect(fs.readFileSync(`${zipOf(dir, 'v1.0.0')}.asc`, 'utf-8')).toBe('signature of zip-original');
    });

    it('sg refuses a ZIP that is not the one that was downloaded', async () => {
        const { dir, StorageService, LibraryManager, remote } = await load(1);
        await LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);
        fs.writeFileSync(zipOf(dir, 'v1.0.0'), 'zip-tampered');

        await expect(LibraryManager.auditAndSign('ent', 'v1.0.0')).rejects.toThrow('no coincide con el hash');

        expect(StorageService.getRepo('ent')!.versions['v1.0.0'].isAudited).toBe(false);
        expect(remote.sign).not.toHaveBeenCalled();
    });

    it('sg is refused for Unknown packages', async () => {
        const { LibraryManager } = await load(0);
        await LibraryManager.allowAndDownloadVersion('ent', 'v1.0.0');

        await expect(LibraryManager.auditAndSign('ent', 'v1.0.0')).rejects.toThrow('nivel Trust');
    });
});

describe('Unknown packages', () => {
    it('only download whitelisted tags', async () => {
        const { StorageService, LibraryManager, remote } = await load(0);

        await expect(LibraryManager.registerAndDownload(StorageService.getRepo('ent')!)).rejects.toThrow('lista blanca');
        expect(remote.download).not.toHaveBeenCalled();

        await LibraryManager.allowAndDownloadVersion('ent', 'v1.0.0');
        expect((StorageService.getRepo('ent') as any).allowedVersions).toEqual([ 'v1.0.0' ]);
        expect(await LibraryManager.getVersion('ent')).toBe('v1.0.0');
    });

    it('do not whitelist a tag whose release does not exist', async () => {
        const { StorageService, LibraryManager, remote } = await load(0);
        remote.fetchRelease.mockRejectedValueOnce(new Error('Error de GitHub API: 404 Not Found'));

        await expect(LibraryManager.allowAndDownloadVersion('ent', 'v9.9.9')).rejects.toThrow('404');
        expect((StorageService.getRepo('ent') as any).allowedVersions).toEqual([]);
    });

    it('reject tags that are not a safe folder name', async () => {
        const { LibraryManager, remote } = await load(0);

        await expect(LibraryManager.allowAndDownloadVersion('ent', '../../x')).rejects.toThrow('no válido');
        expect(remote.fetchRelease).not.toHaveBeenCalled();
    });
});

describe('pkg add', () => {
    it('registers an Unknown package without asking GitHub and without reporting an error', async () => {
        const { StorageService, addPackage, remote } = await load(2);

        const answer = await addPackage({ name: 'nuevo', trustLevel: 0, githubUrl: 'alguien/nuevo', description: 'd' });

        expect(answer).toContain("registrado con nivel de confianza 'Unknown'");
        expect(StorageService.getRepo('nuevo')).toMatchObject({ name: 'nuevo', trustLevel: 0, allowedVersions: [], versions: {} });
        expect(remote.getLatestTag).not.toHaveBeenCalled();
    });

    it('says the package was registered when only its download failed', async () => {
        const { StorageService, addPackage, remote } = await load(2);
        remote.download.mockRejectedValueOnce(new Error('GitHub caído'));

        await expect(addPackage({ name: 'nuevo', trustLevel: 2, githubUrl: 'DisChord-Org/nuevo', description: 'd' })).rejects.toThrow('registrado, pero no se pudo descargar');
        expect(StorageService.getRepo('nuevo')).toBeDefined();
    });

    it('rejects names and repositories that could be read as something else', async () => {
        const { StorageService, addPackage, UserError, remote } = await load(2);
        const bad = [
            { name: '__proto__', githubUrl: 'a/b' },
            { name: 'con espacios', githubUrl: 'a/b' },
            { name: 'ok', githubUrl: '../../user?' },
            { name: 'ok', githubUrl: 'a/b/c' },
            { name: 'ok', githubUrl: 'a/..' },
            { name: 'ok', githubUrl: 'https://evil.example/a/b' }
        ];

        for (const input of bad) {
            await expect(addPackage({ ...input, trustLevel: 2, description: 'd' }), JSON.stringify(input)).rejects.toBeInstanceOf(UserError);
        }
        expect(Object.keys(StorageService.getRepos())).toEqual([ 'ent' ]);
        expect(remote.getLatestTag).not.toHaveBeenCalled();
    });

    it('md rejects an invalid repository and keeps the old one', async () => {
        const { StorageService, modifyPackage, UserError } = await load(2);

        expect(() => modifyPackage('ent', { githubUrl: '../../user?' })).toThrow(UserError);
        expect(StorageService.getRepo('ent')!.githubUrl).toBe('DisChord-Org/ent');
    });
});

describe('registry lookups', () => {
    it('never resolve inherited keys to a package', async () => {
        const { StorageService, LibraryManager } = await load(2);

        for (const name of [ '__proto__', 'constructor', 'toString', 'hasOwnProperty' ]) {
            expect(StorageService.getRepo(name), name).toBeUndefined();
            expect(await LibraryManager.getVersion(name), name).toBeNull();
        }
    });

    it('writes an audit line for what changes the registry', async () => {
        const { dir, StorageService, LibraryManager } = await load(2);
        await LibraryManager.registerAndDownload(StorageService.getRepo('ent')!);
        LibraryManager.deleteRepository('ent');

        const events = fs.readFileSync(path.join(dir, 'audit.log'), 'utf-8').trim().split('\n').map(line => JSON.parse(line));
        expect(events.map(e => e.event)).toEqual([ 'package.downloaded', 'package.deleted' ]);
        expect(events[0]).toMatchObject({ package: 'ent', tag: 'v1.0.0', signed: true });
    });
});

describe('GitHubService', () => {
    const respond = (body: BodyInit | null, headers: Record<string, string> = {}) =>
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200, headers }));

    it('only downloads ZIPs from the GitHub API over https', async () => {
        const { GitHubService } = await loadStorage();
        const fetchSpy = respond('zip');

        for (const url of [ 'http://api.github.com/repos/a/b/zipball/v1', 'https://evil.example/a.zip', 'https://api.github.com.evil.example/x', 'file:///etc/passwd', 'nope' ]) {
            await expect(GitHubService.downloadZipBuffer(url), url).rejects.toThrow();
        }
        expect(fetchSpy).not.toHaveBeenCalled();

        expect((await GitHubService.downloadZipBuffer('https://api.github.com/repos/a/b/zipball/v1')).toString()).toBe('zip');
    });

    it('rejects downloads larger than the limit, announced or not', async () => {
        const { GitHubService } = await loadStorage();
        process.env.MAX_PACKAGE_BYTES = '10';

        try {
            respond('x', { 'content-length': '5000' });
            await expect(GitHubService.downloadZipBuffer('https://api.github.com/repos/a/b/zipball/v1')).rejects.toThrow('tamaño máximo');

            vi.restoreAllMocks();
            respond('x'.repeat(50));
            await expect(GitHubService.downloadZipBuffer('https://api.github.com/repos/a/b/zipball/v1')).rejects.toThrow('tamaño máximo');
        } finally {
            delete process.env.MAX_PACKAGE_BYTES;
        }
    });

    it('refuses repository identifiers that would change the API path, and omits the token when there is none', async () => {
        const { GitHubService } = await loadStorage();
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v1.0.0', zipball_url: 'https://api.github.com/repos/a/b/zipball/v1.0.0' })));
        delete process.env.GITHUB_LIBRARIES_TOKEN;

        await expect(GitHubService.fetchGitHubRelease('../../user?')).rejects.toThrow('no válido');
        expect(fetchSpy).not.toHaveBeenCalled();

        await GitHubService.fetchGitHubRelease('a/b', 'v1.0.0');
        const [ url, init ] = fetchSpy.mock.calls[0] as [ string, RequestInit ];
        expect(url).toBe('https://api.github.com/repos/a/b/releases/tags/v1.0.0');
        expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('rejects answers that are not a release', async () => {
        const { GitHubService } = await loadStorage();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ login: 'someone' })));

        await expect(GitHubService.fetchGitHubRelease('a/b')).rejects.toThrow('release válida');
    });
});
