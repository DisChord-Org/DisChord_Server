import path from "path";
import fs from "fs";
import semver from 'semver';

/**
 * Defines the security level and automation constraints for a package.
 */
export enum TrustLevel {
    /** Untrusted or external community packages. */
    Unknown = 0,
    /** Trusted community packages; may require confirmation for sensitive actions. */
    Trust = 1,
    /** Verified DisChord packages; fully automated management. */
    Official = 2
}

/**
 * Core metadata for a library repository.
 */
export interface RepositoryData {
    name: string;
    description: string;
    trustLevel: TrustLevel;
    allowedVersions?: string[]; // Just for Unknown levels.
    githubUrl: string;
}

/** Map structure for repository JSON storage. */
type RepositoryDataFromJSON = Record<RepositoryData['name'], RepositoryData>;

/**
 * Handles the lifecycle of external libraries, from registration 
 * to automated downloads and updates via GitHub.
 */
class LibraryManager {
    /** Base directory for all repository-related data. */
    public ReposBaseDir: string = path.join(process.cwd(), 'Repositories');
    /** Path to the JSON file containing the registry of available repositories. */
    public AvailableReposPath: string = path.join(this.ReposBaseDir, 'AvailableRepos.json');
    /** Directory where the physical library files (ZIPs) are stored. */
    public DownloadedReposDir: string = path.join(this.ReposBaseDir, 'downloaded');
    /** In-memory cache to prevent GitHub API rate limiting for Official/Trust repositories. */
    private versionCache: Record<string, { tag: string, expires: number }> = {};

    constructor () {
        this.checkPaths();
    }

    /**
     * Ensures all necessary directories and configuration files exist on startup.
     * @private
     */
    private checkPaths() {
        [ this.ReposBaseDir, this.DownloadedReposDir ].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        if (!fs.existsSync(this.AvailableReposPath)) {
            fs.writeFileSync(this.AvailableReposPath, '{}', 'utf-8');
        }
    }

    /**
     * Fetches the latest release data for a repository from the GitHub API.
     * @param githubUrl The GitHub repository identifier.
     * @returns A promise that resolves to the GitHub API release object.
     * @throws Error if the GitHub API response is not OK.
     * @private
     */
    private async fetchGitHubRelease (githubUrl: RepositoryData['githubUrl']): Promise<any> {
        const apiUrl = `https://api.github.com/repos/${githubUrl}/releases/latest`;
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
     * Retrieves all registered repositories from the local JSON registry.
     * @returns An object containing all registered repositories indexed by name.
     */
    public get repos (): RepositoryDataFromJSON {
        return JSON.parse(fs.readFileSync(this.AvailableReposPath, 'utf-8'));
    }

    /**
     * Validates if a specific version tag is permitted based on TrustLevel or whitelist.
     * @param repository The repository metadata.
     * @param version The tag name to validate.
     * @returns True if the version is allowed, false otherwise.
     */
    public isVersionAllowed(repository: RepositoryData, version: string): boolean {
        if (repository.trustLevel >= TrustLevel.Trust) return true;
        return repository.allowedVersions?.includes(version) ?? false;
    }

    /**
     * Registers a repository in the local registry and downloads its source code if allowed.
     * For Official/Trust levels, it only updates metadata. For Unknown, it stores files physically.
     * @param repository The repository data to register.
     * @returns A promise that resolves when the operation is complete.
     * @throws Error if the GitHub API request or ZIP download fails.
     */
    public async registerAndDownload (repository: RepositoryData) {
        const currentRepos = this.repos;

        const releaseData = await this.fetchGitHubRelease(repository.githubUrl);

        currentRepos[repository.name] = repository;
        fs.writeFileSync(this.AvailableReposPath, JSON.stringify(currentRepos, null, 4));

        if (repository.trustLevel >= TrustLevel.Trust) return;

        const tag = releaseData.tag_name;

        if (!this.isVersionAllowed(repository, tag)) throw new Error(`El tag ${tag} no está permitido para el repositorio.`);

        const repoDir = path.join(this.DownloadedReposDir, repository.name);
        const versionDir = path.join(repoDir, tag);

        if (fs.existsSync(versionDir)) return;
        fs.mkdirSync(versionDir, { recursive: true });

        const zipResponse = await fetch(releaseData.zipball_url);
        if (!zipResponse.ok) throw new Error("No se pudo descargar el archivo ZIP.");

        const buffer = Buffer.from(await zipResponse.arrayBuffer());
        const zipPath = path.join(versionDir, `${repository.name}-${tag}.zip`);
        
        fs.writeFileSync(zipPath, buffer);
        fs.writeFileSync(path.join(versionDir, 'version.txt'), tag, 'utf-8');
    }

    /**
     * Resolves the current version of a repository. 
     * Uses GitHub API (with cache) for Official/Trust, or the highest local version for Unknown.
     * @param repoName The name of the repository to check.
     * @returns A promise resolving to the version tag or null if not found.
     */
    public async getVersion(repoName: string): Promise<string | null> {
        const repository = this.repos[repoName];

        if (repository.trustLevel >= TrustLevel.Trust) {
            const now = Date.now();
            const cached = this.versionCache[repoName];

            if (cached && now < cached.expires) return cached.tag;

            const releaseData = await this.fetchGitHubRelease(repository.githubUrl);
            const tag = releaseData.tag_name;

            this.versionCache[repoName] = { tag, expires: now + (10 * 60 * 1000) };
            return tag;
        }

        const repoDir = path.join(this.DownloadedReposDir, repoName);
        if (!fs.existsSync(repoDir)) return null;

        const versions = fs.readdirSync(repoDir).filter(folder => {
            return fs.statSync(path.join(repoDir, folder)).isDirectory();
        });

        if (versions.length === 0) return null;

        return versions.sort(semver.compare).reverse()[0];
    }

    /**
     * Construct the physical path to a specific version's ZIP file.
     * @param repoName Name of the repository.
     * @param version Specific version tag.
     * @returns The full path to the ZIP file or null if it doesn't exist.
     */
    public getZipPath(repoName: string, version: string): string | null {
        const zipPath = path.join(this.DownloadedReposDir, repoName, version, `${repoName}-${version}.zip`);
        return fs.existsSync(zipPath) ? zipPath : null;
    }

    /**
     * Whitelists a new version for an Unknown repository and triggers its download.
     * @param repoName The name of the repository.
     * @param version The specific tag name to allow and download.
     * @throws Error if the repository is not registered.
     */
    public async allowAndDownloadVersion(repoName: string, version: string) {
        const repository = this.repos[repoName];
        if (!repository) throw new Error("El repositorio no existe");

        if (!this.isVersionAllowed(repository, version)) {
            repository.allowedVersions?.push(version);
            this.updateRepositoryMetadata(repository);
        }

        await this.registerAndDownload(this.repos[repoName]);
    }

    /**
     * Updates an existing repository's metadata in the JSON registry.
     * @param repository - The updated repository data.
     * @throws Error if the repository does not exist in the registry.
     */
    public updateRepositoryMetadata(repository: RepositoryData) {
        const currentRepos = this.repos;

        if (!currentRepos[repository.name]) throw new Error(`No se puede actualizar: El repositorio '${repository.name}' no existe.`);

        currentRepos[repository.name] = { ...currentRepos[repository.name], ...repository };
        fs.writeFileSync(this.AvailableReposPath, JSON.stringify(currentRepos, null, 4));
    }

    /**
     * Removes a repository from the registry and deletes all its physical files.
     * @param repoName - The name of the repository to delete.
     */
    public deleteRepository(repoName: string) {
        const currentRepos = this.repos;

        if (!currentRepos[repoName]) return;

        delete currentRepos[repoName];
        fs.writeFileSync(this.AvailableReposPath, JSON.stringify(currentRepos, null, 4));

        const repoDir = path.join(this.DownloadedReposDir, repoName);
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    }

    /**
     * Manually overrides the version.txt of a repository and updates allowedVersions.
     * @param repoName The name of the repository.
     * @param newVersion The version tag to set as current.
     * @throws Error if the repository is not registered.
     */
    public updateRepositoryVersion(repoName: RepositoryData['name'], newVersion: string) {
        const repository = this.repos[repoName];
        if (!repository) throw new Error(`No se puede actualizar la versión: El repositorio '${repoName}' no existe.`);
        
        const versionPath = path.join(this.DownloadedReposDir, repoName, 'version.txt');
        fs.writeFileSync(versionPath, newVersion, 'utf-8');
        this.updateRepositoryMetadata({ ...repository, allowedVersions: [ newVersion ] });
    }
}

/** Singleton instance of LibraryManager for global use. */
export const LibraryManagerInstance = new LibraryManager();