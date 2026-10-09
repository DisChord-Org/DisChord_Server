import { Request, Response } from 'express';

import LibraryManager from '../../utils/libraries/LibraryManager';
import StorageService from '../../utils/libraries/StorageService';
import { ResolvedPackage } from '../middlewares/package.middleware';
import { PackageResponse, toPackageResponse } from '../presenters/package.presenter';

const resolved = (res: Response): ResolvedPackage => res.locals.package;

export const getPackages = async (_req: Request, res: Response) => {
    const response: Record<PackageResponse['name'], PackageResponse> = {};

    for (const pkg of Object.values(StorageService.getRepos())) {
        response[pkg.name] = toPackageResponse(pkg, await LibraryManager.getVersion(pkg.name));
    }

    res.json(response);
};

export const getPackage = (_req: Request, res: Response) => {
    const { pkg, tag } = resolved(res);
    return res.json(toPackageResponse(pkg, tag));
};

export const downloadPackage = (_req: Request, res: Response) => {
    const { pkg, tag } = resolved(res);

    const zipPath = StorageService.getZipPath(pkg.name, tag);
    if (!zipPath) return res.status(404).json({ error: 'Physical ZIP file not found on server' });

    return res.download(zipPath, `${pkg.name}-${tag}.zip`);
};

export const downloadPackageSign = (_req: Request, res: Response) => {
    const { pkg, tag } = resolved(res);

    const zipPath = StorageService.getZipPath(pkg.name, tag);
    if (!zipPath) return res.status(404).json({ error: 'Physical ZIP file not found on server' });

    const signaturePath = `${zipPath}.asc`;
    if (!StorageService.fileExists(signaturePath)) return res.status(404).json({ error: 'Signature file not found on server' });

    return res.download(signaturePath, `${pkg.name}-${tag}.zip.asc`);
};
