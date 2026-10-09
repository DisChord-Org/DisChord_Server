import semver from 'semver';

import LibraryManager from '../libraries/LibraryManager';
import StorageService from '../libraries/StorageService';
import GitHubService from '../libraries/GitHubService';
import { TrustPolicy } from '../libraries/TrustPolicy';
import { RepositoryData, TrustLevel } from '../libraries/types';

/** Expected failure that must be shown to the user as the action's answer. */
export class UserError extends Error {}

const errorMessage = (error: unknown): string => (error as Error).message;

/** @throws {UserError} If the package is not in the registry. */
export function requireRepo(name: string): RepositoryData {
    const repo = StorageService.getRepo(name);
    if (!repo) throw new UserError(`El repositorio '${name}' no existe.`);
    return repo;
}

/** Returns a copy of the repository with another trust level, keeping its versions and fixing the whitelist field. */
export function withTrustLevel(repo: RepositoryData, trustLevel: TrustLevel): RepositoryData {
    const { allowedVersions, ...rest } = repo as RepositoryData & { allowedVersions?: string[] };
    const base = { ...rest, trustLevel };

    if (trustLevel === TrustLevel.Unknown) {
        return { ...base, allowedVersions: repo.trustLevel === TrustLevel.Unknown ? allowedVersions ?? [] : [] } as RepositoryData;
    }

    return base as RepositoryData;
}

export interface NewPackage {
    name: string;
    trustLevel: TrustLevel;
    githubUrl: string;
    description: string;
}

/** Registers a package and downloads its latest release when its trust level allows it. */
export async function addPackage({ name, trustLevel, githubUrl, description }: NewPackage): Promise<string> {
    try {
        StorageService.assertSafeSegment(name);
    } catch (error) {
        throw new UserError(`Error al registrar el repositorio:\n    ${errorMessage(error)}`);
    }

    if (StorageService.getRepo(name)) throw new UserError(`El repositorio '${name}' ya existe. Usa md para modificarlo.`);

    try {
        await LibraryManager.registerAndDownload({
            name,
            description,
            trustLevel,
            githubUrl,
            ...(trustLevel === TrustLevel.Unknown ? { allowedVersions: [] as string[] } : {})
        } as RepositoryData);
    } catch (error) {
        throw new UserError(`Error al registrar el repositorio:\n    ${errorMessage(error)}`);
    }

    return `Repositorio '${name}' registrado exitosamente con nivel de confianza '${TrustLevel[trustLevel]}'.`;
}

/** Lists packages whose name or description starts with the filter (or equals the name). */
export function listPackages(filter?: string): string {
    return Object.values(StorageService.getRepos())
        .filter(repo => !filter || repo.name === filter || repo.name.startsWith(filter) || repo.description.startsWith(filter))
        .map(repo => `${repo.name} (${TrustLevel[repo.trustLevel]})\n    - ${repo.githubUrl}\n    - ${repo.description}`)
        .join('\n');
}

export function deletePackage(name: string): string {
    requireRepo(name);

    LibraryManager.deleteRepository(name);
    return `Repositorio '${name}' eliminado exitosamente.`;
}

export interface PackageChanges {
    trustLevel?: TrustLevel;
    githubUrl?: string;
    description?: string;
}

/** Changes metadata only; versions and the whitelist are kept (see {@link withTrustLevel}). */
export function modifyPackage(name: string, changes: PackageChanges): string {
    const repo = requireRepo(name);

    const updated = withTrustLevel(repo, changes.trustLevel ?? repo.trustLevel);
    updated.githubUrl = changes.githubUrl ?? repo.githubUrl;
    updated.description = changes.description ?? repo.description;

    try {
        LibraryManager.updateRepositoryMetadata(updated);
    } catch (error) {
        throw new UserError(`Error al modificar el repositorio:\n    ${errorMessage(error)}`);
    }

    return `Repositorio '${name}' modificado exitosamente.`;
}

export function isVersionAllowed(name: string, version: string): string {
    const allowed = LibraryManager.isVersionAllowed(requireRepo(name), version);

    return `'${name} ${version}' ${allowed ? 'está' : 'NO está'} permitido.`;
}

/** Whitelists a version of an Unknown package and downloads it. */
export async function allowVersion(name: string, version: string): Promise<string> {
    const repo = requireRepo(name);

    if (repo.trustLevel !== TrustLevel.Unknown) throw new UserError(`El repositorio '${name}' debe ser de confianza desconocida.`);

    try {
        await LibraryManager.allowAndDownloadVersion(name, version);
    } catch (error) {
        throw new UserError(`Error al permitir y descargar la versión '${version}' del repositorio '${name}':\n    ${errorMessage(error)}`);
    }

    return `Versión '${version}' del repositorio '${name}' permitida y descargada exitosamente.`;
}

export async function getLocalVersion(name: string): Promise<string> {
    requireRepo(name);

    const localVersion = await LibraryManager.getVersion(name);
    if (!localVersion) throw new UserError(`No hay una versión descargada para el repositorio '${name}'.`);

    return `'${name} ${localVersion}' (latest)`;
}

export async function signVersion(name: string, version: string): Promise<string> {
    requireRepo(name);

    try {
        await LibraryManager.auditAndSign(name, version);
    } catch (error) {
        throw new UserError(`Error al firmar el paquete:\n    ${errorMessage(error)}`);
    }

    return 'Se ha firmado el paquete.';
}

/** Downloads the latest GitHub release when it differs from the newest local version. */
export async function updatePackage(name: string): Promise<string> {
    const repo = requireRepo(name);

    const remoteVersion = await GitHubService.getLatestTag(repo.githubUrl, true);
    const localVersion = await LibraryManager.getVersion(name);

    if (!localVersion) throw new UserError(`No hay una versión descargada para el repositorio '${name}'.`);

    const sameVersion = remoteVersion === localVersion || (!!semver.valid(remoteVersion) && !!semver.valid(localVersion) && semver.eq(remoteVersion, localVersion));
    if (sameVersion) throw new UserError('No hay nuevas releases.');

    try {
        await LibraryManager.registerAndDownload(repo);
        if (TrustPolicy.canBeAudited(repo.trustLevel)) await LibraryManager.auditAndSign(name, remoteVersion);
    } catch (error) {
        throw new UserError(`Error al actualizar el paquete:\n    ${errorMessage(error)}`);
    }

    return `${name}@${localVersion} -> ${name}@${remoteVersion} (latest)`;
}
