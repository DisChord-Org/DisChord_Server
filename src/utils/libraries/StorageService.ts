import path from "path";
import fs from "fs";

import { RepositoryData, RepositoryDataFromJSON } from "./types";

/**
 * Handles exclusively physical storage operations: JSON registry management,
 * directory structure, and ZIP file persistence.
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
     * @private
     */
    private initStructure() {
        [ StorageService.ReposBaseDir, StorageService.DownloadedReposDir ].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        if (!fs.existsSync(StorageService.AvailableReposPath)) {
            fs.writeFileSync(StorageService.AvailableReposPath, '{}', 'utf-8');
        }
    }

    /** READ: All registered repos. */
    public static getRepos(): RepositoryDataFromJSON {
        const data = fs.readFileSync(StorageService.AvailableReposPath, 'utf-8');
        return JSON.parse(data);
    }

    public static getRepo(name: RepositoryData['name']): RepositoryData | undefined {
        return StorageService.getRepos()[name];
    }

    /** WRITE: Save the entire registry. */
    public static saveRepos(repos: RepositoryDataFromJSON) {
        fs.writeFileSync(StorageService.AvailableReposPath, JSON.stringify(repos, null, 4));
    }

    /** Get directory list of a repo to find versions. */
    public static getLocalVersionFolders(repoName: string): string[] {
        const repoDir = path.join(StorageService.DownloadedReposDir, repoName);
        if (!fs.existsSync(repoDir)) return [];

        return fs.readdirSync(repoDir).filter(file =>
            fs.statSync(path.join(repoDir, file)).isDirectory()
        );
    }

    /** Save a physical ZIP and its metadata. */
    public static savePackageFiles(repoName: string, tag: string, buffer: Buffer) {
        const versionDir = path.join(StorageService.DownloadedReposDir, repoName, tag);
        if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

        const zipPath = path.join(versionDir, `${repoName}-${tag}.zip`);
        fs.writeFileSync(zipPath, buffer);
        fs.writeFileSync(path.join(versionDir, 'version.txt'), tag, 'utf-8');
    }

    /**
     * Construct the physical path to a specific version's ZIP file.
     * @param repoName Name of the repository.
     * @param version Specific version tag.
     * @returns The full path to the ZIP file or null if it doesn't exist.
     */
    public static getZipPath(repoName: string, version: string): string | null {
        const zipPath = path.join(StorageService.DownloadedReposDir, repoName, version, `${repoName}-${version}.zip`);
        return fs.existsSync(zipPath) ? zipPath : null;
    }

    /** Physical deletion of a repo folder. */
    public static removeRepoDirectory(repoName: string) {
        const repoDir = path.join(StorageService.DownloadedReposDir, repoName);
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    }

    public static removePackageZip(repoName: string, tag: string) {
        const zipPath = StorageService.getZipPath(repoName, tag);
        if (zipPath) fs.unlinkSync(zipPath);
    }
}

new StorageService();

export default StorageService;