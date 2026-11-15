import fs from 'fs';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStorage } from './helpers';

vi.mock('../src/client', () => ({
    default: { messages: { write: vi.fn(async () => undefined) }, users: { write: vi.fn(async () => undefined) } }
}));

vi.mock('../src/utils/version-instance', () => {
    const versions = { server: 'v1.5.0', compiler: 'v1.2.3', cli: 'v0.5.0', ide: 'v2.0.0' };
    return {
        default: { ...versions, toJSON: () => versions, refresh: vi.fn(async () => undefined), fetchLatestVersion: vi.fn(async () => 'v1.5.0') }
    };
});

const SECRET = 'test-internal-secret';
let server: Server | undefined;

/** Starts the real Express app on a free port, over an empty storage directory. */
const start = async (secret: string | undefined = SECRET) => {
    if (secret === undefined) delete process.env.INTERNAL_SECRET;
    else process.env.INTERNAL_SECRET = secret;

    const ctx = await loadStorage();
    const { default: app } = await import('../src/server/app');
    const { default: client } = await import('../src/client');

    server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const get = (path: string) => fetch(base + path, { redirect: 'manual' });
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    return { ...ctx, client: client as any, get, post };
};

afterEach(async () => {
    await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
    server = undefined;
    vi.restoreAllMocks();
});

describe('GET /download/:component/:version/:os', () => {
    it('redirects to the release asset of the organization', async () => {
        const { get } = await start();

        const res = await get('/download/cli/v0.4.0/windows');
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://github.com/DisChord-Org/DischordCLI/releases/download/v0.4.0/chord-x86_64-pc-windows-msvc.exe');

        const latest = await get('/download/ide/latest/macos');
        expect(latest.headers.get('location')).toBe('https://github.com/DisChord-Org/DisChord-Code-Studio/releases/download/v2.0.0/DisChord.Code.Studio_2.0.0_aarch64.dmg');
    });

    it('gives Debian and Ubuntu the .deb of the IDE and everyone else the .rpm', async () => {
        const { get } = await start();
        const fileFor = async (userAgent: string) => {
            const res = await fetch(new URL((await get('/versions')).url).origin + '/download/ide/latest/linux', { redirect: 'manual', headers: { 'user-agent': userAgent } });
            return res.headers.get('location')!.split('/').pop();
        };

        expect(await fileFor('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('DisChord.Code.Studio_2.0.0_amd64.deb');
        expect(await fileFor('Mozilla/5.0 (X11; Debian; Linux x86_64)')).toBe('DisChord.Code.Studio_2.0.0_amd64.deb');
        expect(await fileFor('Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('DisChord.Code.Studio-2.0.0-1.x86_64.rpm');
        expect(await fileFor('curl/8.5.0')).toBe('DisChord.Code.Studio-2.0.0-1.x86_64.rpm');
    });

    it('never redirects outside the organization', async () => {
        const { get } = await start();
        const attacks = [
            '/download/cli/..%2F..%2F..%2F..%2Fattacker%2Frepo%2Freleases%2Fdownload%2Fv1/windows',
            '/download/cli/v1.0.0%2F..%2F..%2Fx/windows',
            '/download/cli/v1.0.0/..%2F..%2Fx',
            '/download/cli/v1.0.0/solaris',
            '/download/__proto__/v1.0.0/windows',
            '/download/constructor/v1.0.0/windows'
        ];

        for (const path of attacks) {
            const res = await get(path);
            expect(res.status, path).toBe(400);
            expect(res.headers.get('location'), path).toBeNull();
        }
    });
});

describe('GET /download/:component/:version/:os/checksum', () => {
    const HASH = 'a'.repeat(64);
    const realFetch = globalThis.fetch;

    /** Fakes api.github.com only; requests to the server under test still go out for real. */
    const fakeGitHub = (answer: () => Response) => {
        const calls: { url: string; headers: Record<string, string> }[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input instanceof Request ? input.url : input);
            if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);

            calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
            return answer();
        });
        return calls;
    };

    const release = (assets: unknown[]) => () => new Response(JSON.stringify({ tag_name: 'v0.5.0', assets }), { status: 200 });

    it('answers the file, the tag and the SHA-256 of what the download route redirects to', async () => {
        const { get } = await start();
        process.env.GITHUB_TOKEN = 'token-de-prueba';
        const calls = fakeGitHub(release([
            { name: 'chord-x86_64-pc-windows-msvc.exe', digest: `sha256:${HASH.toUpperCase()}` },
            { name: 'chord-x86_64-unknown-linux-gnu', digest: `sha256:${'b'.repeat(64)}` }
        ]));

        try {
            const res = await get('/download/cli/latest/windows/checksum');
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ file: 'chord-x86_64-pc-windows-msvc.exe', tag: 'v0.5.0', sha256: HASH });

            const redirect = await get('/download/cli/latest/windows');
            expect(redirect.headers.get('location')).toBe('https://github.com/DisChord-Org/DischordCLI/releases/download/v0.5.0/chord-x86_64-pc-windows-msvc.exe');

            expect(calls).toHaveLength(1);
            expect(calls[0].url).toBe('https://api.github.com/repos/DisChord-Org/DischordCLI/releases/tags/v0.5.0');
            expect(calls[0].headers.Authorization).toBe('token token-de-prueba');
        } finally {
            delete process.env.GITHUB_TOKEN;
        }
    });

    it('asks GitHub once per release, however many files and requests', async () => {
        const { get } = await start();
        const calls = fakeGitHub(release([
            { name: 'chord-x86_64-pc-windows-msvc.exe', digest: `sha256:${HASH}` },
            { name: 'chord-x86_64-unknown-linux-gnu', digest: `sha256:${'b'.repeat(64)}` }
        ]));

        for (const os of [ 'windows', 'linux', 'windows', 'linux' ]) expect((await get(`/download/cli/latest/${os}/checksum`)).status).toBe(200);
        expect(calls).toHaveLength(1);

        expect((await get('/download/cli/v0.4.0/windows/checksum')).status).toBe(200);
        expect(calls).toHaveLength(2);
    });

    it('uses the same IDE file the redirect would choose for that client', async () => {
        const { get } = await start();
        fakeGitHub(release([ { name: 'DisChord.Code.Studio-2.0.0-1.x86_64.rpm', digest: `sha256:${HASH}` } ]));

        expect(await (await get('/download/ide/latest/linux/checksum')).json()).toEqual({ file: 'DisChord.Code.Studio-2.0.0-1.x86_64.rpm', tag: 'v2.0.0', sha256: HASH });
    });

    it('rejects an invalid component, os or version without asking GitHub', async () => {
        const { get } = await start();
        const calls = fakeGitHub(release([]));

        for (const path of [ '/download/nope/latest/windows/checksum', '/download/cli/latest/solaris/checksum', '/download/cli/..%2F..%2Fx/windows/checksum', '/download/__proto__/latest/windows/checksum' ]) {
            expect((await get(path)).status, path).toBe(400);
        }
        expect(calls).toHaveLength(0);
    });

    it('answers 404 when the asset has no digest, or a malformed one', async () => {
        const { get } = await start();
        fakeGitHub(release([
            { name: 'chord-x86_64-pc-windows-msvc.exe' },
            { name: 'chord-x86_64-unknown-linux-gnu', digest: 'md5:abc' },
            { name: 'chord-aarch64-apple-darwin', digest: 'sha256:short' }
        ]));

        for (const os of [ 'windows', 'linux', 'macos' ]) {
            const res = await get(`/download/cli/latest/${os}/checksum`);
            expect(res.status, os).toBe(404);
            expect((await res.json()).message, os).toContain('No checksum available');
        }
    });

    it('answers 404 when the release does not exist, and 502 when GitHub fails', async () => {
        const { get } = await start();
        fakeGitHub(() => new Response('{}', { status: 404 }));

        const missing = await get('/download/cli/v9.9.9/windows/checksum');
        expect(missing.status).toBe(404);
        expect((await missing.json()).message).toContain('Release v9.9.9 not found');

        vi.restoreAllMocks();
        fakeGitHub(() => new Response('{}', { status: 500 }));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        expect((await get('/download/cli/v8.8.8/windows/checksum')).status).toBe(502);
    });
});

describe('internal endpoints', () => {
    it('refuse everything when INTERNAL_SECRET is not configured', async () => {
        const { post, client } = await start(undefined);

        expect((await post('/internal/ssh-login', { user: 'root' })).status).toBe(403);
        expect((await post('/internal/ssh-login', { user: 'root', secret: 'undefined' })).status).toBe(403);
        expect((await post('/versions/update', {})).status).toBe(403);
        expect(client.messages.write).not.toHaveBeenCalled();
    });

    it('refuse a wrong, missing or non-string secret', async () => {
        const { post, client } = await start();

        for (const secret of [ 'wrong', '', undefined, null, 123, [ SECRET ], { $ne: 1 } ]) {
            expect((await post('/internal/ssh-login', { user: 'root', secret })).status, JSON.stringify(secret)).toBe(403);
        }
        expect((await post('/versions/update', { secret: 'wrong' })).status).toBe(403);
        expect(client.messages.write).not.toHaveBeenCalled();
    });

    it('throttle attempts to guess the secret', async () => {
        const { post } = await start();

        const statuses: number[] = [];
        for (let i = 0; i < 12; i++) statuses.push((await post('/internal/ssh-login', { secret: `guess-${i}` })).status);

        expect(statuses.slice(0, 10).every(status => status === 403)).toBe(true);
        expect(statuses.at(-1)).toBe(429);
    });

    it('announce an SSH login without letting the body ping anyone or break the format', async () => {
        const { post, client } = await start();

        const res = await post('/internal/ssh-login', { secret: SECRET, user: '`@everyone`\n**x**', ip: { evil: true }, date: 'x'.repeat(500) });

        expect(res.status).toBe(200);
        const [ channel, body ] = client.messages.write.mock.calls[0];
        expect(channel).toBe('1031279210687385640');
        expect(body.allowed_mentions).toEqual({ parse: [] });
        expect(body.content).not.toMatch(/`@everyone`\n/);
        expect(body.content.length).toBeLessThan(400);
        expect(client.users.write.mock.calls[0][1].content).toContain('**IP:** `desconocido`');
    });

    it('still answer when Discord fails', async () => {
        const { post, client } = await start();
        client.messages.write.mockRejectedValueOnce(new Error('Discord caído'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        expect((await post('/internal/ssh-login', { secret: SECRET, user: 'root' })).status).toBe(200);
    });

    it('accept /versions/update with the right secret', async () => {
        const { post } = await start();

        const res = await post('/versions/update', { secret: SECRET });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ deploying: false });
    });
});

describe('package routes', () => {
    const seed = async () => {
        const ctx = await start();
        ctx.StorageService.saveRepos({
            ent: { name: 'ent', description: 'd', githubUrl: 'o/ent', trustLevel: 2, versions: { 'v1.0.0': { tag: 'v1.0.0', isAudited: true, downloadUrl: 'u', createdAt: 1 } } }
        } as any);
        ctx.StorageService.savePackageFiles('ent', 'v1.0.0', Buffer.from('zip-bytes'));
        return ctx;
    };

    it('serve the registry, a package and its ZIP', async () => {
        const { get } = await seed();

        expect(Object.keys(await (await get('/packages')).json())).toEqual([ 'ent' ]);
        expect(await (await get('/packages/ent/1.0.0')).json()).toMatchObject({ name: 'ent', version: 'v1.0.0', isAudited: true });

        const zip = await get('/packages/ent/v1.0.0/download');
        expect(zip.status).toBe(200);
        expect(await zip.text()).toBe('zip-bytes');

        expect((await get('/packages/ent/v1.0.0/sign/download')).status).toBe(404);
    });

    it('answer 400 or 404 to names and versions that try to leave the registry', async () => {
        const { get } = await seed();

        expect((await get('/packages/__proto__/v1.0.0')).status).toBe(404);
        expect((await get('/packages/constructor/v1.0.0/download')).status).toBe(404);
        expect((await get('/packages/..%2F..%2Fetc/v1.0.0/download')).status).toBe(404);
        expect((await get('/packages/ent/..%2F..%2Fx/download')).status).toBe(400);
        expect((await get('/packages/ent/latest')).status).toBe(400);
    });

    it('answers 500 instead of hanging when the registry is corrupt, without leaking the error', async () => {
        const { get, StorageService } = await seed();
        fs.writeFileSync(StorageService.AvailableReposPath, '{ not json');
        vi.spyOn(console, 'error').mockImplementation(() => {});

        for (const path of [ '/packages', '/packages/ent/v1.0.0' ]) {
            const res = await get(path);
            expect(res.status, path).toBe(500);
            expect(await res.json(), path).toEqual({ error: 'Internal server error' });
        }
    });
});

describe('everything else', () => {
    it('answers unknown routes and broken JSON bodies as JSON errors', async () => {
        const { get } = await start();

        const missing = await get('/nope');
        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: 'Not found' });
        expect(missing.headers.get('x-powered-by')).toBeNull();

        const address = server!.address() as AddressInfo;
        const broken = await fetch(`http://127.0.0.1:${address.port}/versions/update`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{ nope' });
        expect(broken.status).toBe(400);
        expect(await broken.json()).toEqual({ error: 'Bad request' });
    });

    it('reads TRUST_PROXY as a hop count, a boolean or a list', async () => {
        await loadStorage();
        const { parseTrustProxy } = await import('../src/server/app');

        expect(parseTrustProxy(undefined)).toBe(1);
        expect(parseTrustProxy('2')).toBe(2);
        expect(parseTrustProxy('false')).toBe(false);
        expect(parseTrustProxy('loopback')).toBe('loopback');
    });
});
