import path from "path";
import fs from "fs";
import crypto from "crypto";

import { PackageVersion, RepositoryData, RepositoryDataFromJSON } from "./types";

/** A package written to the staging area, not yet visible as a version. */
export interface StagedPackage {
    dir: string;
    zipPath: string;
}

/**
 * Handles exclusively physical storage operations: JSON registry management,
 * directory structure, and ZIP file persistence.
 * * This service acts as the Single Source of Truth for the file system state.
 * @class StorageService
 */
class StorageService {
    /** Base directory for all repository-related data. */
    public static ReposBaseDir: string = process.env.DISCHORD_REPOS_DIR ?? path.join(process.cwd(), 'Repositories');
    /** Path to the JSON file containing the registry of available repositories. */
    public static AvailableReposPath: string = path.join(this.ReposBaseDir, 'AvailableRepos.json');
    /** Directory where the physical library files (ZIPs) are stored. */
    public static DownloadedReposDir: string = path.join(this.ReposBaseDir, 'downloaded');
    /** Where packages are written and signed before they become a version (same disk, so the final move is a rename). */
    public static StagingDir: string = path.join(this.ReposBaseDir, '.staging');

    constructor () {
        this.initStructure();
    }

    /**
     * Guards every name that ends up inside a file system path (repository names and tags).
     * @param {string} segment - Repository name or version tag.
     * @returns {string} The same value if it is a safe single path segment.
     * @throws {Error} If it could escape the storage directory (separators, `..`, empty, ...).
     */
    public static assertSafeSegment(segment: string): string {
        if (typeof segment !== 'string' || segment === '' || segment === '.' || segment === '..' || /[\/\\\0]/.test(segment)) {
            throw new Error(`Nombre no válido para el almacenamiento: '${segment}'`);
        }
        return segment;
    }

    /**
     * Ensures all necessary directories and configuration files exist on startup.
     * Creates the basic hierarchy if it's the first time running the server.
     * @private
     */
    private initStructure(): void {
        // Whatever is still staged belongs to a download that died with the previous process.
        fs.rmSync(StorageService.StagingDir, { recursive: true, force: true });

        [ StorageService.ReposBaseDir, StorageService.DownloadedReposDir, StorageService.StagingDir ].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        if (!fs.existsSync(StorageService.AvailableReposPath)) {
            fs.writeFileSync(StorageService.AvailableReposPath, '{}', 'utf-8');
        }
    }

    /**
     * Reads and parses the entire repository registry from the JSON file.
     * @returns {RepositoryDataFromJSON} An object mapping repository names to their metadata.
     * @throws {SyntaxError} If the JSON file is corrupted.
     */
    public static getRepos(): RepositoryDataFromJSON {
        const data = fs.readFileSync(StorageService.AvailableReposPath, 'utf-8');
        return JSON.parse(data);
    }

    /**
     * Retrieves the metadata of a specific repository by its name.
     * @param {RepositoryData['name']} name - The unique name of the repository.
     * @returns {RepositoryData | undefined} The repository data or undefined if not registered.
     */
    public static getRepo(name: RepositoryData['name']): RepositoryData | undefined {
        const repos = StorageService.getRepos();
        // Own keys only: `__proto__` or `constructor` must never resolve to something that looks like a package.
        return typeof name === 'string' && Object.hasOwn(repos, name) ? repos[name] : undefined;
    }

    /**
     * Overwrites the repository registry file with the provided data.
     * Used after registration, updates, or deletions.
     * @param {RepositoryDataFromJSON} repos - The complete set of repository data to persist.
     */
    public static saveRepos(repos: RepositoryDataFromJSON): void {
        // Written to a temporary file and renamed so a crash can never leave a half-written registry.
        const tmpPath = `${StorageService.AvailableReposPath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(repos, null, 4));
        fs.renameSync(tmpPath, StorageService.AvailableReposPath);
    }

    /**
     * Read-modify-write over the registry in a single synchronous step, so changes made
     * elsewhere while the caller was awaiting something (downloads, API calls) are never overwritten.
     * The mutator must change the records it is given, never replace them with a copy it read earlier.
     * @param {(repos: RepositoryDataFromJSON) => T} mutate - Receives the freshly read registry and mutates it in place.
     * @returns {T} Whatever the mutator returns.
     */
    public static updateRepos<T = void>(mutate: (repos: RepositoryDataFromJSON) => T): T {
        const repos = StorageService.getRepos();
        const result = mutate(repos);
        StorageService.saveRepos(repos);
        return result;
    }

    /**
     * Scans the file system for existing version folders of a specific repository.
     * @param {string} repoName - The name of the repository to scan.
     * @returns {string[]} An array of folder names (tags) found on disk.
     */
    public static getLocalVersionFolders(repoName: RepositoryData['name']): PackageVersion['tag'][] {
        const repoDir = path.join(StorageService.DownloadedReposDir, StorageService.assertSafeSegment(repoName));
        if (!fs.existsSync(repoDir)) return [];

        return fs.readdirSync(repoDir).filter(file =>
            fs.statSync(path.join(repoDir, file)).isDirectory()
        );
    }

    /** The folder a version lives in: `downloaded/[repo]/[tag]/`. */
    private static versionDir(repoName: RepositoryData['name'], tag: PackageVersion['tag']): string {
        return path.join(StorageService.DownloadedReposDir, StorageService.assertSafeSegment(repoName), StorageService.assertSafeSegment(tag));
    }

    /** @returns {boolean} Whether that version is already stored. Stored versions are never replaced. */
    public static hasVersion(repoName: RepositoryData['name'], tag: PackageVersion['tag']): boolean {
        return fs.existsSync(StorageService.versionDir(repoName, tag));
    }

    /**
     * Writes a package to the staging area, where it can be hashed and signed before anybody can see it.
     * Finish with {@link commitStagedPackage} or {@link discardStagedPackage}.
     * @param {string} repoName - Name of the repository.
     * @param {string} tag - Version tag.
     * @param {Buffer} buffer - The binary content of the ZIP file.
     */
    public static stagePackage(repoName: RepositoryData['name'], tag: PackageVersion['tag'], buffer: Buffer): StagedPackage {
        StorageService.assertSafeSegment(repoName);
        StorageService.assertSafeSegment(tag);

        fs.mkdirSync(StorageService.StagingDir, { recursive: true });
        const dir = fs.mkdtempSync(path.join(StorageService.StagingDir, 'pkg-'));
        const zipPath = path.join(dir, `${repoName}-${tag}.zip`);

        fs.writeFileSync(zipPath, buffer);
        fs.writeFileSync(path.join(dir, 'version.txt'), tag, 'utf-8');

        return { dir, zipPath };
    }

    /**
     * Turns a staged package into the stored version with a single rename, so a version either
     * exists complete (ZIP, version.txt and signature if any) or does not exist at all.
     * @throws {Error} If that version is already stored.
     */
    public static commitStagedPackage(staged: StagedPackage, repoName: RepositoryData['name'], tag: PackageVersion['tag']): void {
        const versionDir = StorageService.versionDir(repoName, tag);
        if (fs.existsSync(versionDir)) throw new Error(`La versión '${tag}' de '${repoName}' ya está almacenada.`);

        fs.mkdirSync(path.dirname(versionDir), { recursive: true });
        fs.renameSync(staged.dir, versionDir);
    }

    public static discardStagedPackage(staged: StagedPackage): void {
        fs.rmSync(staged.dir, { recursive: true, force: true });
    }

    /**
     * Persists a package's binary data (ZIP) and its version metadata to the disk.
     * Creates the directory structure `downloaded/[repo]/[tag]/` in one atomic step.
     * @param {string} repoName - Name of the repository.
     * @param {string} tag - Version tag.
     * @param {Buffer} buffer - The binary content of the ZIP file.
     * @throws {Error} If that version is already stored.
     */
    public static savePackageFiles(repoName: RepositoryData['name'], tag: PackageVersion['tag'], buffer: Buffer): void {
        const staged = StorageService.stagePackage(repoName, tag, buffer);

        try {
            StorageService.commitStagedPackage(staged, repoName, tag);
        } catch (error) {
            StorageService.discardStagedPackage(staged);
            throw error;
        }
    }

    /**
     * Constructs the absolute physical path to a specific version's ZIP file.
     * @param {string} repoName - Name of the repository.
     * @param {string} version - Specific version tag.
     * @returns {string | null} The full path to the ZIP file or null if the file is missing.
     */
    public static getZipPath(repoName: RepositoryData['name'], version: PackageVersion['tag']): string | null {
        const zipPath = path.join(StorageService.versionDir(repoName, version), `${repoName}-${version}.zip`);
        return fs.existsSync(zipPath) ? zipPath : null;
    }

    /** @returns {boolean} Whether a file exists at the given absolute path. */
    public static fileExists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    /** @returns {string} The hex-encoded SHA-256 of a file. */
    public static hashFile(filePath: string): string {
        return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    }

    /**
     * Deletes the entire directory tree associated with a repository.
     * Warning: This action is irreversible and deletes all versions and their files.
     * @param {string} repoName - The name of the repository to remove.
     */
    public static removeRepoDirectory(repoName: RepositoryData['name']): void {
        const repoDir = path.join(StorageService.DownloadedReposDir, StorageService.assertSafeSegment(repoName));
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    }

    /** Deletes one stored version. Only used to undo a download whose registry entry could not be written. */
    public static removeVersionDirectory(repoName: RepositoryData['name'], tag: PackageVersion['tag']): void {
        fs.rmSync(StorageService.versionDir(repoName, tag), { recursive: true, force: true });
    }
}

// Initialization of the structure on module load
new StorageService();

export default StorageService;
