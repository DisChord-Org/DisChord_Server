import path from "path";
import fs from "fs";

/**
 * Defines the security level and automation constraints for a package.
 */
enum TrustLevel {
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
interface RepositoryData {
    name: string;
    trustLevel: TrustLevel;
    allowedVersions?: string[];
    githubUrl: string;
}

/** Map structure for repository JSON storage. */
type RepositoryDataFromJSON = Record<RepositoryData['name'], RepositoryData>;

/**
 * Handles the lifecycle of external libraries, from registration 
 * to automated downloads and updates via GitHub.
 */
class LibraryManager {
    private ReposBaseDir: string = path.join(process.cwd(), 'Repositories');
    private AvailableReposPath: string = path.join(this.ReposBaseDir, 'AvailableRepos.json');
    private DownloadedReposDir: string = path.join(this.ReposBaseDir, 'downloaded');

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
     * @returns A promise that resolves to the GitHub API Fetch Response.
     * @private
     */
    private async downloadFromGitHub (githubUrl: RepositoryData['githubUrl']): Promise<Response> {
        const apiUrl = `https://api.github.com/repos/${githubUrl}/releases/latest`;
        return await fetch(apiUrl, {
            headers: {
                'User-Agent': 'DisChord-Server'
            }
        });
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
        if (repository.trustLevel === TrustLevel.Official) return true;
        if (!repository.allowedVersions || repository.allowedVersions.length === 0) return true;

        return repository.allowedVersions.includes(version);
    }

    /**
     * Registers a repository in the local registry and downloads its source code if allowed.
     * @param repository The repository data to register.
     * @returns A promise that resolves when the operation is complete.
     * @throws Error if the GitHub API request or ZIP download fails.
     */
    public async registerAndDownload (repository: RepositoryData) {
        const currentRepos = this.repos;

        currentRepos[repository.name] = repository;
        fs.writeFileSync(this.AvailableReposPath, JSON.stringify(currentRepos, null, 4));

        const response = await this.downloadFromGitHub(repository.githubUrl);

        if (!response.ok) throw new Error(`GitHub API falló: ${response.statusText}`);
            
        const releaseData = await response.json();
        const tag = releaseData.tag_name;

        if (!this.isVersionAllowed(repository, tag)) return;

        const repoDir = path.join(this.DownloadedReposDir, repository.name);
        if (fs.existsSync(repoDir)) fs.unlinkSync(repoDir);
        fs.mkdirSync(repoDir);

        const zipUrl = releaseData.zipball_url;
        const zipResponse = await fetch(zipUrl);

        if (!zipResponse.ok) throw new Error("No se pudo descargar el archivo ZIP.");

        const arrayBuffer = await zipResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const outputPath = path.join(repoDir, `${repository.name}-${tag}.zip`);

        fs.writeFileSync(path.join(repoDir, 'version.txt'), tag, 'utf-8');
        fs.writeFileSync(outputPath, buffer);
    }

    /**
     * Reads the current local version of a downloaded library.
     * @param repoName - The name of the repository to check
     * @returns The tag name or null if the library isn't downloaded.
     */
    public getLocalVersion(repoName: RepositoryData['name']): string | null {
        const versionPath = path.join(this.DownloadedReposDir, repoName, 'version.txt');

        if (fs.existsSync(versionPath)) return fs.readFileSync(versionPath, 'utf-8').trim();

        return null;
    }

    /**
     * Compares local versions with the latest GitHub releases and updates if necessary.
     * @returns A promise that resolves when all repositories have been checked and updated.
     */
    public async updateAllDownloadedRepositories() {
        const allRepos = this.repos;
        const repoNames = Object.keys(allRepos);

        for (const name of repoNames) {
            const repository = allRepos[name];
            const currentLocalVersion = this.getLocalVersion(name);

            const response = await this.downloadFromGitHub(repository.githubUrl);
            if (!response.ok) continue;

            const release = await response.json();

            if (currentLocalVersion === release.tag_name) continue;

            await this.registerAndDownload(repository);
        }
    }

    /**
     * Checks if a repository name exists in the local registry.
     * @returns True if the repository exists, false otherwise.
     */
    public existsRepository(repoName: RepositoryData['name']): boolean {
        return !!this.repos[repoName];
    }

    /**
     * Updates an existing repository's metadata in the JSON registry.
     * @param repository - The updated repository data.
     * @throws Error if the repository does not exist in the registry.
     */
    public updateRepository(repository: RepositoryData) {
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
}

/** Singleton instance of LibraryManager for global use. */
export const LibraryManagerInstance = new LibraryManager();