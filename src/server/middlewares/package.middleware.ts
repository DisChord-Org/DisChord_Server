import { NextFunction, Request, Response } from 'express';
import semver from 'semver';

import LibraryManager from '../../utils/libraries/LibraryManager';
import StorageService from '../../utils/libraries/StorageService';
import { PackageVersion, RepositoryData } from '../../utils/libraries/types';

/** What `resolvePackage` leaves in `res.locals` for the controller. */
export interface ResolvedPackage {
    pkg: RepositoryData;
    tag: PackageVersion['tag'];
}

/**
 * Validates `:repo` and `:version`, then resolves the package and the locally stored version tag.
 * Answers 400/404 itself, so controllers only run with a valid `res.locals.package`.
 * @param {string} notFoundMessage - Error text used when the package is not in the registry.
 */
export const resolvePackage = (notFoundMessage: string = 'Package not found') => async (req: Request, res: Response, next: NextFunction) => {
    const { repo, version } = req.params;

    if (!repo || typeof repo != 'string') return res.status(400).json({ error: 'Package name is not valid' });
    if (!version || typeof version != 'string' || !semver.valid(version)) return res.status(400).json({ error: 'Version is not valid' });

    const pkg = StorageService.getRepo(repo);
    if (!pkg) return res.status(404).json({ error: notFoundMessage });

    const tag = await LibraryManager.getVersion(pkg.name, version);
    if (!tag) return res.status(404).json({ error: 'No version available' });

    res.locals.package = { pkg, tag } satisfies ResolvedPackage;
    return next();
};
