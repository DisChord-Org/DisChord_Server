import { Request, Response } from 'express';

import LibraryManager from 'src/utils/libraries/LibraryManager';
import { RepositoryData, TrustLevel } from 'src/utils/libraries/types';
import StorageService from 'src/utils/libraries/StorageService';

interface PackageResponse {
    name: RepositoryData['name'];
    description: RepositoryData['description'];
    trustLevel: RepositoryData['trustLevel'];
    repository: RepositoryData['githubUrl'];
    version: string;
    signature?: string;
    isAudited: boolean;
}

type PackagesRecordResponse = Record<PackageResponse['name'], PackageResponse>;
type pkgName = keyof typeof StorageService.getRepos;

export const getPackages = async (_req: Request, res: Response) => {
    const repositories = StorageService.getRepos();
    const repoKeys = Object.keys(repositories) as pkgName[];

    const packagesList = await Promise.all(repoKeys.map(async (name): Promise<PackageResponse | null> => {
        const pkg = repositories[name];

        return {
            name: pkg.name,
            description: pkg.description,
            trustLevel: pkg.trustLevel,
            repository: pkg.githubUrl,
            version: await LibraryManager.getVersion(pkg.name)
        } as PackageResponse;
    }));

    const response: PackagesRecordResponse = packagesList
        .filter(p => p !== null)
        .reduce((acc, curr) => ({ ...acc, [curr!.name]: curr }), {});

    res.json(response);
};

export const getPackage = async (req: Request, res: Response) => {
    const { repo } = req.params;
    const pkg = StorageService.getRepo(repo as pkgName);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const tag = await LibraryManager.getVersion(pkg.name);
    if (!tag) return res.status(404).json({ error: 'No version available' });
    const version = tag? pkg.versions[tag] : null;

    return res.json({
        name: pkg.name,
        description: pkg.description,
        trustLevel: pkg.trustLevel,
        repository: pkg.githubUrl,
        version: tag,
        signature: version?.signature,
        isAudited: version?.isAudited ?? false
    } as PackageResponse);
};

export const downloadPackage = async (req: Request, res: Response) => {
    const { repo } = req.params as pkgName;
    const pkg = StorageService.getRepo(repo);
    
    if (!pkg) return res.status(404).json({ error: 'Package not found in registry' });

    const tag = await LibraryManager.getVersion(repo);
    if (!tag) return res.status(404).json({ error: 'No version available' });

    if (pkg.trustLevel >= TrustLevel.Trust) {
        return res.redirect(`https://github.com/${pkg.githubUrl}/archive/refs/tags/${tag}.zip`);
    } 

    const zipPath = StorageService.getZipPath(pkg.name, tag);
    if (!zipPath) return res.status(404).json({ error: 'Physical ZIP file not found on server' });

    return res.download(zipPath, `${pkg.name}-${tag}.zip`);
};