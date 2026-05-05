import { Request, Response } from 'express';
import semver from 'semver';

import LibraryManager from '../../utils/libraries/LibraryManager';
import { PackageVersion, RepositoryData } from '../../utils/libraries/types';
import StorageService from '../../utils/libraries/StorageService';

interface PackageResponse {
    name: RepositoryData['name'];
    description: RepositoryData['description'];
    trustLevel: RepositoryData['trustLevel'];
    repository: RepositoryData['githubUrl'];
    version: PackageVersion['tag'];
    isAudited: PackageVersion['isAudited'];
    versions?: RepositoryData['versions'];
}

type PackagesRecordResponse = Record<PackageResponse['name'], PackageResponse>;
type pkgName = keyof typeof StorageService.getRepos;

export const getPackages = async (_req: Request, res: Response) => {
    const repositories = StorageService.getRepos();
    const repoKeys = Object.keys(repositories) as pkgName[];

    const packagesList = await Promise.all(repoKeys.map(async (name): Promise<PackageResponse | null> => {
        const pkg = repositories[name];
        const tag = await LibraryManager.getVersion(pkg.name);

        return {
            name: pkg.name,
            description: pkg.description,
            trustLevel: pkg.trustLevel,
            repository: pkg.githubUrl,
            version: tag,
            isAudited: tag? pkg.versions[tag]?.isAudited ?? false : false
        } as PackageResponse;
    }));

    const response: PackagesRecordResponse = packagesList
        .filter(p => p !== null)
        .reduce((acc, curr) => ({ ...acc, [curr!.name]: curr }), {});

    res.json(response);
};

export const getPackage = async (req: Request, res: Response) => {
    const { repo, version } = req.params;

    if (!repo || typeof repo != 'string') return res.status(400).json({ error: 'Package name is not valid' });
    if (!version || typeof version != 'string' || !semver.valid(version)) return res.status(400).json({ error: 'Version is not valid' });
    
    const pkg = StorageService.getRepo(repo);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const tag = await LibraryManager.getVersion(pkg.name, version);
    if (!tag) return res.status(404).json({ error: 'No version available' });

    return res.json({
        name: pkg.name,
        description: pkg.description,
        trustLevel: pkg.trustLevel,
        repository: pkg.githubUrl,
        version: tag,
        isAudited: tag? pkg.versions[tag]?.isAudited ?? false : false,
        versions: pkg.versions
    } as PackageResponse);
};

export const downloadPackage = async (req: Request, res: Response) => {
    const { repo, version } = req.params;

    if (!repo || typeof repo != 'string') return res.status(400).json({ error: 'Package name is not valid' });
    if (!version || typeof version != 'string' || !semver.valid(version)) return res.status(400).json({ error: 'Version is not valid' });

    const pkg = StorageService.getRepo(repo);
    if (!pkg) return res.status(404).json({ error: 'Package not found in registry' });

    const tag = await LibraryManager.getVersion(repo, version);
    if (!tag) return res.status(404).json({ error: 'No version available' });

    const zipPath = StorageService.getZipPath(pkg.name, tag);
    if (!zipPath) return res.status(404).json({ error: 'Physical ZIP file not found on server' });

    return res.download(zipPath, `${pkg.name}-${tag}.zip`);
};

export const downloadPackageSign = async (req: Request, res: Response) => {
    const { repo, version } = req.params;
    
    if (!repo || typeof repo != 'string') return res.status(400).json({ error: 'Package name is not valid' });
    if (!version || typeof version != 'string' || !semver.valid(version)) return res.status(400).json({ error: 'Version is not valid' });
    
    const pkg = StorageService.getRepo(repo);
    if (!pkg) return res.status(404).json({ error: 'Package not found in registry' });

    const tag = await LibraryManager.getVersion(repo, version);
    if (!tag) return res.status(404).json({ error: 'No version available' });

    const zipPath = StorageService.getZipPath(pkg.name, tag);
    if (!zipPath) return res.status(404).json({ error: 'Physical ZIP file not found on server' });

    return res.download(`${zipPath}.asc`, `${pkg.name}-${tag}.zip.asc`);
};