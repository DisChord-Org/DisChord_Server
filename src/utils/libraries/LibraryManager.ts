import semver from 'semver';

import { PackageVersion, RepositoryData, TrustLevel } from "./types";
import StorageService from "./StorageService";
import GitHubService from "./GitHubService";
import { SecurityService } from './SecurityService';

/**
 * The Orchestrator. Coordinates storage, GitHub communication, and security
 * to manage the DisChord library ecosystem.
 * * @class LibraryManager
 */
class LibraryManager {

    constructor() {}

    /**
     * Validates if a specific version tag is permitted based on TrustLevel or whitelist.
     * * @param {RepositoryData} repository - The repository metadata to check.
     * @param {string} version - The version tag name.
     * @returns {boolean} True if the version is allowed, false otherwise.
     */
    public static isVersionAllowed(repository: RepositoryData, version: string): boolean {
        if (repository.trustLevel >= TrustLevel.Trust) return true;
        if (repository.trustLevel === TrustLevel.Unknown) {
            return repository.allowedVersions.includes(version);
        }
        return false;
    }

    /**
     * Registers a repository in the registry and handles automated downloads/updates.
     * For high trust levels, it only updates metadata; for Unknown, it triggers 
     * the physical download process if the version is whitelisted.
     * * @param {RepositoryData} repository - The repository data to register or update.
     * @returns {Promise<void>}
     * @throws {Error} If the version is not allowed for the repository.
     * @throws {Error} If the GitHub API request or ZIP download fails.
     */
    public static async registerAndDownload(repository: RepositoryData): Promise<void> {
        const repos = StorageService.getRepos();
        const tag = await GitHubService.getLatestTag(repository.githubUrl);
        const releaseData = await GitHubService.fetchGitHubRelease(repository.githubUrl, tag);

        if (!repository.versions) repository.versions = {};
        repos[repository.name] = repository;
        StorageService.saveRepos(repos);

        if (!LibraryManager.isVersionAllowed(repository, tag)) throw new Error(`Acceso denegado: El tag ${tag} no está en la lista blanca para ${repository.name}`);
 
        await LibraryManager.downloadAndProcessPackage(repository.name, tag, releaseData.zipball_url);
    }

    /**
     * Internal lifecycle handler for packages. Downloads from GitHub, signs with GPG 
     * according to TrustLevel, and updates both physical storage and JSON registry.
     * * @param {RepositoryData['name']} repoName - The unique name of the repository.
     * @param {string} tag - The version tag to process.
     * @param {string} zipUrl - The GitHub direct URL for the source code ZIP.
     * @returns {Promise<void>}
     * @throws {Error} If the repository is not found in the registry.
     * @throws {Error} If the file cannot be saved to disk or signing fails.
     * @private
     */
    private static async downloadAndProcessPackage(repoName: RepositoryData['name'], tag: string, zipUrl: string): Promise<void> {
        const buffer = await GitHubService.downloadZipBuffer(zipUrl);
        const repository = StorageService.getRepo(repoName);
        if (!repository) throw new Error("Repositorio no registrado");

        StorageService.savePackageFiles(repoName, tag, buffer);
        const zipPath = StorageService.getZipPath(repoName, tag);
        if (!zipPath) throw new Error("Error al guardar el archivo temporal.");

        const versionInfo: PackageVersion = {
            tag,
            isAudited: false,
            downloadUrl: zipUrl,
            createdAt: Date.now()
        };

        switch (repository.trustLevel) {
            case TrustLevel.Official:
                SecurityService.signFile(zipPath);
                versionInfo.signature = SecurityService.getSignatureContent(zipPath) || undefined;
                versionInfo.isAudited = true;

                StorageService.removePackageZip(repoName, tag);
                break;
            case TrustLevel.Unknown:
                SecurityService.signFile(zipPath);
                versionInfo.signature = SecurityService.getSignatureContent(zipPath) || undefined;
                versionInfo.isAudited = true;
                break;
            default:
                break;
        }

        repository.versions[tag] = versionInfo;
        LibraryManager.updateRepositoryMetadata(repository);
    }

    /**
     * Resolves the current version for a repository.
     * Uses GitHub API (with cache) for Official/Trust, or the highest semver 
     * version available on disk for Unknown.
     * * @param {RepositoryData['name']} repoName - The repository name to check.
     * @returns {Promise<string | null>} The version tag or null if not found.
     */
    public static async getVersion(repoName: RepositoryData['name']): Promise<string | null> {
        const repository = StorageService.getRepo(repoName);
        if (!repository) return null;

        if (repository.trustLevel >= TrustLevel.Trust) {
            return await GitHubService.getLatestTag(repository.githubUrl);
        }

        const folders = StorageService.getLocalVersionFolders(repoName);
        if (folders.length === 0) return null;

        return folders.sort(semver.compare).reverse()[0];
    }

    /**
     * Adds a specific version to the whitelist of an Unknown repository and initiates download.
     * * @param {RepositoryData['name']} repoName - The name of the repository.
     * @param {string} version - The specific tag name to allow.
     * @returns {Promise<void>}
     * @throws {Error} If the repository does not exist.
     * @throws {Error} If the GitHub release fetch fails.
     */
    public static async allowAndDownloadVersion(repoName: RepositoryData['name'], version: string): Promise<void> {
        const repository = StorageService.getRepo(repoName);
        if (!repository) throw new Error("El repositorio no existe en el registro.");

        if (repository.trustLevel === TrustLevel.Unknown) {
            if (!repository.allowedVersions.includes(version)) {
                repository.allowedVersions.push(version);
                LibraryManager.updateRepositoryMetadata(repository);
            }
        }

        const releaseData = await GitHubService.fetchGitHubRelease(repository.githubUrl, version);
        await this.downloadAndProcessPackage(repoName, version, releaseData.zipball_url);
    }

    /**
     * Updates an existing repository's metadata in the persistent JSON registry.
     * * @param {RepositoryData} repository - The updated repository data object.
     * @throws {Error} If the repository does not exist in the current registry.
     */
    public static updateRepositoryMetadata(repository: RepositoryData): void {
        const repos = StorageService.getRepos();
        if (!repos[repository.name]) throw new Error("Repositorio no encontrado.");

        repos[repository.name] = repository;
        StorageService.saveRepos(repos);
    }

    /**
     * Permanently deletes a repository's metadata and its physical files from the server.
     * * @param {RepositoryData['name']} repoName - The name of the repository to purge.
     * @returns {void}
     */
    public static deleteRepository(repoName: RepositoryData['name']): void {
        const repos = StorageService.getRepos();
        if (!repos[repoName]) return;

        delete repos[repoName];
        StorageService.saveRepos(repos);
        StorageService.removeRepoDirectory(repoName);
    }

    /**
     * Manually audits a Trust level package. Signs the physical ZIP file, 
     * generates ASCII signature, and updates the version status in the registry.
     * * @param {string} repoName - The name of the repository.
     * @param {string} tag - The version tag to audit.
     * @returns {Promise<void>}
     * @throws {Error} If files are missing or the level is not Trust.
     * @throws {Error} If GPG signing fails.
     */
    public static async auditAndSignTrust(repoName: string, tag: string): Promise<void> {
        const repository = StorageService.getRepo(repoName);
        const zipPath = StorageService.getZipPath(repoName, tag);

        if (!repository || !zipPath) throw new Error("Paquete o archivo ZIP no encontrado.");
        if (repository.trustLevel !== TrustLevel.Trust) throw new Error("Solo se pueden auditar manualmente paquetes de nivel Trust.");

        SecurityService.signFile(zipPath);

        const version = repository.versions[tag];
        if (version) {
            version.signature = SecurityService.getSignatureContent(zipPath) || undefined;
            version.isAudited = true;
            LibraryManager.updateRepositoryMetadata(repository);
        }
    }
}

export default LibraryManager;