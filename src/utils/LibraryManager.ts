import path from "path";
import fs from "fs";

enum TrustLevel {
    Unknown = 0, // Unknown packages
    Trust = 1, // Known packages, cli ask every actions
    Official = 2 // Official packages, cli do everything without ask
}

interface RepositoryData {
    name: string;
    trustLevel: TrustLevel;
    allowedVersions?: string[];
    githubUrl: string;
}

type RepositoryDataFromJSON = Record<RepositoryData['name'], RepositoryData>;

class LibraryManager {
    private ReposBaseDir: string = path.join(process.cwd(), 'Repositories');
    private AvailableReposPath: string = path.join(this.ReposBaseDir, 'AvailableRepos.json');
    private DownloadedReposDir: string = path.join(this.ReposBaseDir, 'downloaded');

    constructor () {
        this.checkPaths();
    }

    private checkPaths() {
        [ this.ReposBaseDir, this.DownloadedReposDir ].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        if (!fs.existsSync(this.AvailableReposPath)) {
            fs.writeFileSync(this.AvailableReposPath, '{}', 'utf-8');
        }
    }

    private async downloadFromGitHub (githubUrl: RepositoryData['githubUrl']): Promise<Response> {
        const apiUrl = `https://api.github.com/repos/${githubUrl}/releases/latest`;
        return await fetch(apiUrl, {
            headers: {
                'User-Agent': 'DisChord-Server'
            }
        });
    }

    public get repos (): RepositoryDataFromJSON {
        return JSON.parse(fs.readFileSync(this.AvailableReposPath, 'utf-8'));
    }

    public isVersionAllowed(repository: RepositoryData, version: string): boolean {
        if (repository.trustLevel === TrustLevel.Official) return true;
        if (!repository.allowedVersions || repository.allowedVersions.length === 0) return true;

        return repository.allowedVersions.includes(version);
    }

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

    public getLocalVersion(repoName: RepositoryData['name']): string | null {
        const versionPath = path.join(this.DownloadedReposDir, repoName, 'version.txt');

        if (fs.existsSync(versionPath)) return fs.readFileSync(versionPath, 'utf-8').trim();

        return null;
    }

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

    public existsRepository(repoName: RepositoryData['name']): boolean {
        return !!this.repos[repoName];
    }

    public updateRepository(repository: RepositoryData) {
        const currentRepos = this.repos;

        if (!currentRepos[repository.name]) throw new Error(`No se puede actualizar: El repositorio '${repository.name}' no existe.`);

        currentRepos[repository.name] = { ...currentRepos[repository.name], ...repository };
        fs.writeFileSync(this.AvailableReposPath, JSON.stringify(currentRepos, null, 4));
    }

    public deleteRepository(repoName: string) {
        const currentRepos = this.repos;

        if (!currentRepos[repoName]) return;

        delete currentRepos[repoName];
        fs.writeFileSync(this.AvailableReposPath, JSON.stringify(currentRepos, null, 4));

        const repoDir = path.join(this.DownloadedReposDir, repoName);
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    }
}

export const LibraryManagerInstance = new LibraryManager();