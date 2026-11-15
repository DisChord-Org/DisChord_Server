import { RepositoryData } from "./types";
import { assertGithubRepo } from "./validation";

/** The fields of a GitHub release this server uses. */
export interface GitHubRelease {
    tag_name: string;
    zipball_url: string;
}

/**
 * Service dedicated to interacting with the GitHub REST API.
 * Handles rate-limit caching and release fetching.
 */
class GitHubService {
    /** In-memory cache for version tags to respect GitHub API rate limits. */
    private static versionCache: Record<string, { tag: string, expires: number }> = {};
    private static readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    private static readonly API_TIMEOUT_MS = 15_000;
    private static readonly DOWNLOAD_TIMEOUT_MS = 120_000;
    private static readonly DEFAULT_MAX_PACKAGE_BYTES = 100 * 1024 * 1024;

    /** Largest ZIP the server accepts (`MAX_PACKAGE_BYTES`, default 100 MB). Downloads are held in memory, so this bounds it. */
    public static get maxPackageBytes(): number {
        const configured = Number(process.env.MAX_PACKAGE_BYTES);
        return Number.isFinite(configured) && configured > 0 ? configured : this.DEFAULT_MAX_PACKAGE_BYTES;
    }

    private static headers(): Record<string, string> {
        const headers: Record<string, string> = { 'User-Agent': 'DisChord-Server' };
        if (process.env.GITHUB_LIBRARIES_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_LIBRARIES_TOKEN}`;

        return headers;
    }

    /**
     * Fetches the latest release data for a repository, with local caching.
     * @param githubUrl The GitHub repository identifier (owner/repo).
     * @param forceRefresh If true, bypasses the cache.
     */
    public static async getLatestTag(githubUrl: string, forceRefresh: boolean = false): Promise<string> {
        const now = Date.now();
        const cached = this.versionCache[githubUrl];

        if (!forceRefresh && cached && now < cached.expires) return cached.tag;

        const releaseData = await GitHubService.fetchGitHubRelease(githubUrl, 'latest');
        const tag = releaseData.tag_name;

        this.versionCache[githubUrl] = {
            tag,
            expires: now + this.CACHE_TTL
        };

        return tag;
    }

    /**
     * Fetches a release of a repository from the GitHub API.
     * @param githubUrl The GitHub repository identifier (owner/repo).
     * @param version A tag name, or `latest`.
     * @returns A promise that resolves to the release.
     * @throws Error if the identifier is not `owner/repo`, the response is not OK or it is not a release.
     */
    public static async fetchGitHubRelease (githubUrl: RepositoryData['githubUrl'], version: string = 'latest'): Promise<GitHubRelease> {
        const repo = assertGithubRepo(githubUrl);
        const versionPath = version === 'latest'? 'latest' : `tags/${encodeURIComponent(version)}`;
        const apiUrl = `https://api.github.com/repos/${repo}/releases/${versionPath}`;
        const response = await fetch(apiUrl, { headers: GitHubService.headers(), signal: AbortSignal.timeout(this.API_TIMEOUT_MS) });

        if (!response.ok) throw new Error(`Error de GitHub API: ${response.status} ${response.statusText}`);

        const data = await response.json() as Partial<GitHubRelease> | null;
        if (!data || typeof data.tag_name !== 'string' || typeof data.zipball_url !== 'string') {
            throw new Error('La respuesta de GitHub no es una release válida.');
        }

        return { tag_name: data.tag_name, zipball_url: data.zipball_url };
    }

    /**
     * Downloads the source code ZIP from a GitHub release.
     * @param zipUrl The zipball_url provided by GitHub API.
     * @throws Error if the URL is not GitHub's, the download fails, or it is larger than {@link maxPackageBytes}.
     */
    public static async downloadZipBuffer(zipUrl: string): Promise<Buffer> {
        let url: URL;
        try {
            url = new URL(zipUrl);
        } catch {
            throw new Error('URL de descarga no válida.');
        }
        if (url.protocol !== 'https:' || url.hostname !== 'api.github.com') throw new Error('La URL de descarga no pertenece a GitHub.');

        const limit = GitHubService.maxPackageBytes;
        const response = await fetch(url, { signal: AbortSignal.timeout(this.DOWNLOAD_TIMEOUT_MS) });

        if (!response.ok) throw new Error(`Failed to download ZIP from GitHub: ${response.statusText}`);

        const tooLarge = () => new Error(`El paquete supera el tamaño máximo permitido (${limit} bytes).`);
        if (Number(response.headers.get('content-length')) > limit) {
            await response.body?.cancel();
            throw tooLarge();
        }
        if (!response.body) return Buffer.alloc(0);

        // GitHub does not always announce the size, so it is also counted while it arrives.
        const chunks: Buffer[] = [];
        let received = 0;
        const reader = response.body.getReader();

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            received += value.byteLength;
            if (received > limit) {
                await reader.cancel();
                throw tooLarge();
            }
            chunks.push(Buffer.from(value));
        }

        return Buffer.concat(chunks);
    }
}

export default GitHubService;
