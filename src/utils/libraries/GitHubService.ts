import { RepositoryData } from "./types";

/**
 * Service dedicated to interacting with the GitHub REST API.
 * Handles rate-limit caching and release fetching.
 */
class GitHubService {
    /** In-memory cache for version tags to respect GitHub API rate limits. */
    private static versionCache: Record<string, { tag: string, expires: number }> = {};
    private static readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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
     * Fetches the latest release data for a repository from the GitHub API.
     * @param githubUrl The GitHub repository identifier.
     * @returns A promise that resolves to the GitHub API release object.
     * @throws Error if the GitHub API response is not OK.
     * @private
     */
    public static async fetchGitHubRelease (githubUrl: RepositoryData['githubUrl'], version: string = 'latest'): Promise<any> {
        const apiUrl = `https://api.github.com/repos/${githubUrl}/releases/${version}`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'DisChord-Server',
                'Authorization': `token ${process.env.GITHUB_TOKEN}`
            }
        });

        if (!response.ok) throw new Error(`Error de GitHub API: ${response.statusText}`);
    
        return await response.json();
    }

    /**
     * Downloads the source code ZIP from a GitHub release.
     * @param zipUrl The zipball_url provided by GitHub API.
     */
    public static async downloadZipBuffer(zipUrl: string): Promise<Buffer> {
        const response = await fetch(zipUrl);
        
        if (!response.ok) throw new Error(`Failed to download ZIP from GitHub: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}

export default GitHubService;