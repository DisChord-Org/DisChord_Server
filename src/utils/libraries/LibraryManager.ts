import semver from 'semver';

import { RepositoryData, TrustLevel } from "./types";
import StorageService from "./StorageService";
import GitHubService from "./GitHubService";

/**
 * The Orchestrator. Coordinates storage, GitHub communication, and security
 * to manage the DisChord library ecosystem.
 */
class LibraryManager {

    constructor() {}

    /**
     * Logic check for version permissions.
     */
    public static isVersionAllowed(repository: RepositoryData, version: string): boolean {
        if (repository.trustLevel >= TrustLevel.Trust) return true;
        if (repository.trustLevel === TrustLevel.Unknown) {
            return repository.allowedVersions.includes(version);
        }
        return false;
    }

    /**
     * Main flow: Register a repository and handle physical downloads if necessary.
     */
    public static async registerAndDownload(repository: RepositoryData) {
        const repos = StorageService.getRepos();
        const tag = await GitHubService.getLatestTag(repository.githubUrl);
        const releaseData = await GitHubService.fetchGitHubRelease(repository.githubUrl, tag);

        repos[repository.name] = repository;
        StorageService.saveRepos(repos);

        if (repository.trustLevel >= TrustLevel.Trust) return;

        if (!LibraryManager.isVersionAllowed(repository, tag)) throw new Error(`Acceso denegado: El tag ${tag} no está en la lista blanca para ${repository.name}`);
 
        await LibraryManager.downloadAndProcessPackage(repository.name, tag, releaseData.zipball_url);
    }

    /**
     * Downloads, (future) signs, and stores a package.
     */
    private static async downloadAndProcessPackage(repoName: RepositoryData['name'], tag: string, zipUrl: string) {
        const buffer = await GitHubService.downloadZipBuffer(zipUrl);

        StorageService.savePackageFiles(repoName, tag, buffer);
    }

    /**
     * Resolves the current version of a repository.
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
     * Whitelists a version and triggers download.
     */
    public static async allowAndDownloadVersion(repoName: RepositoryData['name'], version: string) {
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
     * Updates metadata without changing files.
     */
    public static updateRepositoryMetadata(repository: RepositoryData) {
        const repos = StorageService.getRepos();
        if (!repos[repository.name]) throw new Error("Repositorio no encontrado.");

        repos[repository.name] = repository;
        StorageService.saveRepos(repos);
    }

    /**
     * Deletes metadata and physical files.
     */
    public static deleteRepository(repoName: RepositoryData['name']) {
        const repos = StorageService.getRepos();
        if (!repos[repoName]) return;

        delete repos[repoName];
        StorageService.saveRepos(repos);
        StorageService.removeRepoDirectory(repoName);
    }
}

export default LibraryManager;