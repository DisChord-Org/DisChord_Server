import fs from 'fs';
import semver from 'semver';

import { PackageVersion, RepositoryData, RepositoryDataFromJSON, TrustLevel } from "./types";
import StorageService, { StagedPackage } from "./StorageService";
import GitHubService from "./GitHubService";
import { SecurityService } from './SecurityService';
import { TrustPolicy } from './TrustPolicy';
import { AuditLog } from './AuditLog';

/** The record of a repository inside a freshly read registry, own keys only. */
const recordOf = (repos: RepositoryDataFromJSON, name: string): RepositoryData | undefined =>
    Object.hasOwn(repos, name) ? repos[name] : undefined;

/**
 * The Orchestrator. Coordinates storage, GitHub communication, and security
 * to manage the DisChord library ecosystem.
 * * @class LibraryManager
 */
class LibraryManager {
    /** Versions being downloaded right now (`repo@tag`), so the same one is never processed twice at once. */
    private static readonly inFlight = new Set<string>();

    constructor() {}

    /**
     * Validates if a specific version tag is permitted based on TrustLevel or whitelist.
     * * @param {RepositoryData} repository - The repository metadata to check.
     * @param {string} version - The version tag name.
     * @returns {boolean} True if the version is allowed, false otherwise.
     */
    public static isVersionAllowed(repository: RepositoryData, version: string): boolean {
        return TrustPolicy.isVersionAllowed(repository, version);
    }

    /**
     * Adds a repository to the registry without downloading anything.
     * @throws {Error} If a repository with that name is already registered.
     */
    public static register(repository: RepositoryData): void {
        StorageService.updateRepos(repos => {
            if (recordOf(repos, repository.name)) throw new Error(`El repositorio '${repository.name}' ya existe.`);
            repos[repository.name] = { ...repository, versions: repository.versions ?? {} };
        });
        AuditLog.record('package.registered', { package: repository.name, githubUrl: repository.githubUrl, trustLevel: repository.trustLevel });
    }

    /**
     * Makes sure a repository is registered and downloads its latest GitHub release.
     * A repository that is already registered keeps its current record: the one passed in is only
     * used to create it, never to overwrite what changed while GitHub was answering.
     * * @param {RepositoryData} repository - The repository data to register or update.
     * @returns {Promise<void>}
     * @throws {Error} If the version is not allowed for the repository, or is already stored.
     * @throws {Error} If the GitHub API request or ZIP download fails.
     */
    public static async registerAndDownload(repository: RepositoryData): Promise<void> {
        const tag = await GitHubService.getLatestTag(repository.githubUrl);
        const releaseData = await GitHubService.fetchGitHubRelease(repository.githubUrl, tag);

        const created = StorageService.updateRepos(repos => {
            if (recordOf(repos, repository.name)) return false;
            repos[repository.name] = { ...repository, versions: repository.versions ?? {} };
            return true;
        });
        if (created) AuditLog.record('package.registered', { package: repository.name, githubUrl: repository.githubUrl, trustLevel: repository.trustLevel });

        const current = StorageService.getRepo(repository.name);
        if (!current) throw new Error("Repositorio no registrado");
        if (!LibraryManager.isVersionAllowed(current, tag)) throw new Error(`Acceso denegado: El tag ${tag} no está en la lista blanca para ${repository.name}`);

        await LibraryManager.downloadAndProcessPackage(repository.name, tag, releaseData.zipball_url);
    }

    /**
     * Internal lifecycle handler for packages. Downloads from GitHub, signs with GPG
     * according to TrustLevel, and updates both physical storage and JSON registry.
     *
     * A stored version is immutable: git tags can be moved after they were reviewed, so a tag that
     * is already on disk is never downloaded (and therefore never signed) again.
     * Everything happens in a staging folder that becomes the version in one rename, so a failed
     * download or signature leaves nothing behind.
     * * @param {RepositoryData['name']} repoName - The unique name of the repository.
     * @param {string} tag - The version tag to process.
     * @param {string} zipUrl - The GitHub direct URL for the source code ZIP.
     * @returns {Promise<void>}
     * @throws {Error} If the repository is not found in the registry or the version already exists.
     * @throws {Error} If the file cannot be saved to disk or signing fails.
     * @private
     */
    private static async downloadAndProcessPackage(repoName: RepositoryData['name'], tag: string, zipUrl: string): Promise<void> {
        const key = `${repoName}@${tag}`;

        if (StorageService.hasVersion(repoName, tag)) throw new Error(`La versión '${tag}' de '${repoName}' ya está descargada y no se puede reemplazar.`);
        if (LibraryManager.inFlight.has(key)) throw new Error(`La versión '${tag}' de '${repoName}' ya se está descargando.`);

        LibraryManager.inFlight.add(key);
        let staged: StagedPackage | undefined;

        try {
            const buffer = await GitHubService.downloadZipBuffer(zipUrl);
            if (!StorageService.getRepo(repoName)) throw new Error("Repositorio no registrado");

            staged = StorageService.stagePackage(repoName, tag, buffer);

            const versionInfo: PackageVersion = {
                tag,
                isAudited: false,
                downloadUrl: zipUrl,
                createdAt: Date.now(),
                sha256: SecurityService.hash(buffer)
            };

            const repository = StorageService.getRepo(repoName);
            if (!repository) throw new Error("Repositorio no registrado");

            if (TrustPolicy.signsOnDownload(repository.trustLevel)) {
                await SecurityService.signFile(staged.zipPath);

                // Signing takes a moment: the signature only stands if the policy still asks for it.
                const afterSigning = StorageService.getRepo(repoName);
                if (!afterSigning) throw new Error("Repositorio no registrado");

                if (TrustPolicy.signsOnDownload(afterSigning.trustLevel)) versionInfo.isAudited = true;
                else fs.rmSync(`${staged.zipPath}.asc`, { force: true });
            }

            StorageService.commitStagedPackage(staged, repoName, tag);
            staged = undefined;

            try {
                StorageService.updateRepos(repos => {
                    const record = recordOf(repos, repoName);
                    if (!record) throw new Error("Repositorio no encontrado.");

                    record.versions ??= {};
                    record.versions[tag] = versionInfo;
                });
            } catch (error) {
                StorageService.removeVersionDirectory(repoName, tag);
                throw error;
            }

            AuditLog.record('package.downloaded', { package: repoName, tag, sha256: versionInfo.sha256, signed: versionInfo.isAudited });
        } finally {
            LibraryManager.inFlight.delete(key);
            if (staged) StorageService.discardStagedPackage(staged);
        }
    }

    /**
     * Resolves the current version for a specific repository based on local storage.
     * @param {RepositoryData['name']} repoName - The name of the repository to check.
     * @param {PackageVersion['tag']} [version] - (Optional) Specific version tag to search for.
     * @returns {Promise<PackageVersion['tag'] | null>} The resolved version tag or null if the repository or folders are not found.
     */
    public static async getVersion(repoName: RepositoryData['name'], version?: PackageVersion['tag']): Promise<PackageVersion['tag'] | null> {
        const repository = StorageService.getRepo(repoName);
        if (!repository) return null;

        const folders = StorageService.getLocalVersionFolders(repoName).filter(folder => semver.valid(folder));
        if (folders.length === 0) return null;

        if (version) {
            const tag = folders.find((tag: PackageVersion['tag']) => semver.eq(version, tag));

            return tag || null;
        }

        return folders.sort(semver.compare).reverse()[0];
    }

    /**
     * Adds a specific version to the whitelist of an Unknown repository and initiates download.
     * The release is looked up first, so a tag that does not exist is never whitelisted.
     * * @param {RepositoryData['name']} repoName - The name of the repository.
     * @param {string} version - The specific tag name to allow.
     * @returns {Promise<void>}
     * @throws {Error} If the repository does not exist or the version is already stored.
     * @throws {Error} If the GitHub release fetch fails.
     */
    public static async allowAndDownloadVersion(repoName: RepositoryData['name'], version: string): Promise<void> {
        const repository = StorageService.getRepo(repoName);
        if (!repository) throw new Error("El repositorio no existe en el registro.");

        StorageService.assertSafeSegment(version);
        if (StorageService.hasVersion(repoName, version)) throw new Error(`La versión '${version}' de '${repoName}' ya está descargada y no se puede reemplazar.`);

        const releaseData = await GitHubService.fetchGitHubRelease(repository.githubUrl, version);

        const whitelisted = StorageService.updateRepos(repos => {
            const record = recordOf(repos, repoName);
            if (!record) throw new Error("El repositorio no existe en el registro.");
            if (record.trustLevel !== TrustLevel.Unknown || record.allowedVersions.includes(version)) return false;

            record.allowedVersions.push(version);
            return true;
        });
        if (whitelisted) AuditLog.record('package.version-allowed', { package: repoName, tag: version });

        await this.downloadAndProcessPackage(repoName, version, releaseData.zipball_url);
    }

    /**
     * Updates an existing repository's metadata in the persistent JSON registry.
     * * @param {RepositoryData} repository - The updated repository data object.
     * @throws {Error} If the repository does not exist in the current registry.
     */
    public static updateRepositoryMetadata(repository: RepositoryData): void {
        StorageService.updateRepos(repos => {
            if (!recordOf(repos, repository.name)) throw new Error("Repositorio no encontrado.");
            repos[repository.name] = repository;
        });
    }

    /**
     * Permanently deletes a repository's metadata and its physical files from the server.
     * * @param {RepositoryData['name']} repoName - The name of the repository to purge.
     * @returns {void}
     */
    public static deleteRepository(repoName: RepositoryData['name']): void {
        const existed = StorageService.updateRepos(repos => {
            if (!recordOf(repos, repoName)) return false;
            delete repos[repoName];
            return true;
        });
        if (!existed) return;

        StorageService.removeRepoDirectory(repoName);
        AuditLog.record('package.deleted', { package: repoName });
    }

    /**
     * Manually audits a Trust level package. Signs the physical ZIP file,
     * generates ASCII signature, and updates the version status in the registry.
     * The ZIP must still be the one that was downloaded: its hash is compared with the registry first.
     * * @param {string} repoName - The name of the repository.
     * @param {string} tag - The version tag to audit.
     * @returns {Promise<void>}
     * @throws {Error} If files are missing, the level is not Trust, or the ZIP changed since it was downloaded.
     * @throws {Error} If GPG signing fails.
     */
    public static async auditAndSign(repoName: string, tag: string): Promise<void> {
        const repository = StorageService.getRepo(repoName);
        const zipPath = StorageService.getZipPath(repoName, tag);

        if (!repository || !zipPath) throw new Error("Paquete o archivo ZIP no encontrado.");
        if (!TrustPolicy.canBeAudited(repository.trustLevel)) throw new Error("Solo se pueden auditar manualmente paquetes de nivel Trust.");

        const expected = repository.versions?.[tag]?.sha256;
        const actual = StorageService.hashFile(zipPath);
        if (expected && expected !== actual) throw new Error("El ZIP almacenado no coincide con el hash registrado al descargarlo. No se firma.");

        await SecurityService.signFile(zipPath);

        StorageService.updateRepos(repos => {
            const version = recordOf(repos, repoName)?.versions?.[tag];
            if (version) version.isAudited = true;
        });
        AuditLog.record('package.signed', { package: repoName, tag, sha256: actual });
    }
}

export default LibraryManager;
