import fs from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';

/**
 * Loads a fresh copy of the library modules pointed at an empty temporary storage directory,
 * so tests never touch the real `Repositories` folder.
 */
export async function loadStorage() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dischord-test-'));
    process.env.DISCHORD_REPOS_DIR = dir;
    vi.resetModules();

    const { default: StorageService } = await import('../src/utils/libraries/StorageService');
    const { default: LibraryManager } = await import('../src/utils/libraries/LibraryManager');
    const { default: GitHubService } = await import('../src/utils/libraries/GitHubService');
    const { SecurityService } = await import('../src/utils/libraries/SecurityService');
    const types = await import('../src/utils/libraries/types');
    const handlers = await import('../src/utils/pkg/handlers');

    return { dir, StorageService, LibraryManager, GitHubService, SecurityService, ...types, ...handlers };
}

type Loaded = Awaited<ReturnType<typeof loadStorage>>;

/**
 * Replaces GitHub and GPG with fakes: every release exists, its ZIP is whatever `zip.content` holds
 * at download time (change it to simulate a tag that was moved), and signing writes a `.asc` file.
 */
export function fakeRemote({ GitHubService, SecurityService }: Pick<Loaded, 'GitHubService' | 'SecurityService'>, latest: string = 'v1.0.0') {
    const zip = { content: 'zip-original' };
    const remote = { latest };

    const getLatestTag = vi.spyOn(GitHubService, 'getLatestTag').mockImplementation(async () => remote.latest);
    const fetchRelease = vi.spyOn(GitHubService, 'fetchGitHubRelease').mockImplementation(async (repo: string, version: string = 'latest') => {
        const tag = version === 'latest' ? remote.latest : version;
        return { tag_name: tag, zipball_url: `https://api.github.com/repos/${repo}/zipball/${tag}` };
    });
    const download = vi.spyOn(GitHubService, 'downloadZipBuffer').mockImplementation(async () => Buffer.from(zip.content));
    const sign = vi.spyOn(SecurityService, 'signFile').mockImplementation(async (file: string) => {
        fs.writeFileSync(`${file}.asc`, `signature of ${fs.readFileSync(file, 'utf-8')}`);
    });

    return { zip, remote, getLatestTag, fetchRelease, download, sign };
}
