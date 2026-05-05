import path from "path";
import fs from "fs";

import { PackageVersion, RepositoryData, RepositoryDataFromJSON } from "./types";

/**
 * Handles exclusively physical storage operations: JSON registry management,
 * directory structure, and ZIP file persistence.
 * * This service acts as the Single Source of Truth for the file system state.
 * @class StorageService
 */
class StorageService {
    /** Base directory for all repository-related data. */
    public static ReposBaseDir: string = path.join(process.cwd(), 'Repositories');
    /** Path to the JSON file containing the registry of available repositories. */
    public static AvailableReposPath: string = path.join(this.ReposBaseDir, 'AvailableRepos.json');
    /** Directory where the physical library files (ZIPs) are stored. */
    public static DownloadedReposDir: string = path.join(this.ReposBaseDir, 'downloaded');

    constructor () {
        this.initStructure();
    }

    /**
     * Ensures all necessary directories and configuration files exist on startup.
     * Creates the basic hierarchy if it's the first time running the server.
     * @private
     */
    private initStructure(): void {
        [ StorageService.ReposBaseDir, StorageService.DownloadedReposDir ].forEach(dir => {
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
        return StorageService.getRepos()[name];
    }

    /**
     * Overwrites the repository registry file with the provided data.
     * Used after registration, updates, or deletions.
     * @param {RepositoryDataFromJSON} repos - The complete set of repository data to persist.
     */
    public static saveRepos(repos: RepositoryDataFromJSON): void {
        fs.writeFileSync(StorageService.AvailableReposPath, JSON.stringify(repos, null, 4));
    }

    /**
     * Scans the file system for existing version folders of a specific repository.
     * @param {string} repoName - The name of the repository to scan.
     * @returns {string[]} An array of folder names (tags) found on disk.
     */
    public static getLocalVersionFolders(repoName: RepositoryData['name']): PackageVersion['tag'][] {
        const repoDir = path.join(StorageService.DownloadedReposDir, repoName);
        if (!fs.existsSync(repoDir)) return [];

        return fs.readdirSync(repoDir).filter(file =>
            fs.statSync(path.join(repoDir, file)).isDirectory()
        );
    }

    /**
     * Persists a package's binary data (ZIP) and its version metadata to the disk.
     * Creates the directory structure `downloaded/[repo]/[tag]/` if it doesn't exist.
     * @param {string} repoName - Name of the repository.
     * @param {string} tag - Version tag.
     * @param {Buffer} buffer - The binary content of the ZIP file.
     */
    public static savePackageFiles(repoName: RepositoryData['name'], tag: PackageVersion['tag'], buffer: Buffer): void {
        const versionDir = path.join(StorageService.DownloadedReposDir, repoName, tag);
        if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

        const zipPath = path.join(versionDir, `${repoName}-${tag}.zip`);
        fs.writeFileSync(zipPath, buffer);
        fs.writeFileSync(path.join(versionDir, 'version.txt'), tag, 'utf-8');
    }

    /**
     * Constructs the absolute physical path to a specific version's ZIP file.
     * @param {string} repoName - Name of the repository.
     * @param {string} version - Specific version tag.
     * @returns {string | null} The full path to the ZIP file or null if the file is missing.
     */
    public static getZipPath(repoName: RepositoryData['name'], version: PackageVersion['tag']): string | null {
        const zipPath = path.join(StorageService.DownloadedReposDir, repoName, version, `${repoName}-${version}.zip`);
        return fs.existsSync(zipPath) ? zipPath : null;
    }

    /**
     * Deletes the entire directory tree associated with a repository.
     * Warning: This action is irreversible and deletes all versions and their files.
     * @param {string} repoName - The name of the repository to remove.
     */
    public static removeRepoDirectory(repoName: RepositoryData['name']): void {
        const repoDir = path.join(StorageService.DownloadedReposDir, repoName);
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    }

    /**
     * Removes only the ZIP file of a specific version while keeping other metadata (like signatures).
     * Typically used for 'Official' trust level packages to save disk space.
     * @param {string} repoName - Name of the repository.
     * @param {string} tag - Version tag to target.
     */
    public static removePackageZip(repoName: RepositoryData['name'], tag: PackageVersion['tag']): void {
        const zipPath = StorageService.getZipPath(repoName, tag);
        if (zipPath) fs.unlinkSync(zipPath);
    }
}

// Initialization of the structure on module load
new StorageService();

export default StorageService;