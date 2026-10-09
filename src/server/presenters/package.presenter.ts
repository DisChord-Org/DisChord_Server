import { PackageVersion, RepositoryData } from '../../utils/libraries/types';

export interface PackageResponse {
    name: RepositoryData['name'];
    description: RepositoryData['description'];
    trustLevel: RepositoryData['trustLevel'];
    repository: RepositoryData['githubUrl'];
    version: PackageVersion['tag'] | null;
    isAudited: PackageVersion['isAudited'];
    versions: RepositoryData['versions'];
}

/** Builds the public JSON shape of a package for a resolved version tag (null when none is downloaded). */
export function toPackageResponse(pkg: RepositoryData, tag: PackageVersion['tag'] | null): PackageResponse {
    return {
        name: pkg.name,
        description: pkg.description,
        trustLevel: pkg.trustLevel,
        repository: pkg.githubUrl,
        version: tag,
        isAudited: tag ? pkg.versions[tag]?.isAudited ?? false : false,
        versions: pkg.versions
    };
}
