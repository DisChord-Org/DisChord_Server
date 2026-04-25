import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { LibraryManagerInstance, RepositoryData } from 'src/utils/LibraryManager';

interface PackageResponse {
    name: RepositoryData['name'];
    description: RepositoryData['description'];
    trustLevel: RepositoryData['trustLevel'];
    repository: RepositoryData['githubUrl'];
    version: string;
}

type PackagesRecordResponse = Record<PackageResponse['name'], PackageResponse>;
type pkgName = keyof typeof LibraryManagerInstance.repos;

export const getPackages = (_req: Request, res: Response) => {
    const packages: PackagesRecordResponse = {};

    for (const repo in LibraryManagerInstance.repos) {
        const pkg = LibraryManagerInstance.repos[repo as pkgName];
        const version = LibraryManagerInstance.getLocalVersion(repo as pkgName) || 'unknown';

        packages[repo] = {
            name: pkg.name,
            description: pkg.description,
            trustLevel: pkg.trustLevel,
            repository: pkg.githubUrl,
            version
        };
    };

    res.json(packages);
};

export const getPackage = (req: Request, res: Response) => {
    const { repo } = req.params;
    const pkg = LibraryManagerInstance.repos[repo as pkgName];
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    return res.json(pkg);
};

export const downloadPackage = async (req: Request, res: Response) => {
    const { repo } = req.params;
    const pkg = LibraryManagerInstance.repos[repo as pkgName];
    if (!pkg) return res.status(404).json({ error: 'Package not found in registry' });

    const version = LibraryManagerInstance.getLocalVersion(repo as pkgName);
    if (!version) return res.status(404).json({ error: 'Package files not found. Does it exists on the server?' });

    const zipName = `${pkg.name}-${version}.zip`;
    const zipPath = path.join(LibraryManagerInstance.DownloadedReposDir, pkg.name, zipName);

    if (!fs.existsSync(zipPath)) return res.status(404).json({ error: 'Physical ZIP file not found on server' });

    return res.download(zipPath, zipName, (err) => {
        if (err) {
            console.error(`Error enviando el paquete ${repo}:`, err);
            if (!res.headersSent) res.status(500).send('Error downloading file');
        }
    });
};