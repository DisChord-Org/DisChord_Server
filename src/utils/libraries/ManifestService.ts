import fs from 'fs';

import StorageService from './StorageService';
import { SecurityService } from './SecurityService';
import { AuditLog } from './AuditLog';
import { RepositoryData, TrustLevel } from './types';

/** Version of the manifest format. Clients reject manifests whose schema they do not know. */
export const ManifestSchema = 1;

/**
 * What the registry states about one stored version of a package.
 * It is signed as a whole, so a client can trust the trust level and the audit status of a
 * package (and that the ZIP it downloaded is the one meant for that name and version) without
 * trusting the transport or the rest of the unsigned API answers.
 */
export interface PackageManifest {
    schema: typeof ManifestSchema;
    name: RepositoryData['name'];
    version: string;
    /** Hex-encoded SHA-256 of the stored ZIP. */
    sha256: string;
    trustLevel: TrustLevel;
    /** Whether the ZIP itself is signed (automatically or after a manual audit). */
    isAudited: boolean;
}

/** A manifest exactly as it was signed, with its detached ASCII-armored signature. */
export interface SignedManifest {
    /** The serialized manifest. The signature covers these exact bytes, so it must not be re-serialized. */
    manifest: string;
    signature: string;
}

/**
 * Builds, signs and caches the manifest of each stored package version.
 *
 * Manifests are signed on demand and kept next to the ZIP (`<zip>.manifest.json` and its `.asc`).
 * A cached manifest is only served while it still says what the registry says: changing the trust
 * level of a package, or auditing one of its versions, makes the next request sign a fresh one.
 * @class ManifestService
 */
export class ManifestService {
    /** How many times a manifest is rebuilt when the registry changes while gpg is signing it. */
    private static readonly MAX_ATTEMPTS = 3;

    /** Manifests being signed right now (`repo@tag`), so concurrent requests share one signature. */
    private static readonly inFlight = new Map<string, Promise<SignedManifest | null>>();

    /**
     * Serializes a manifest with a fixed key order, so the same statement always produces the same bytes.
     * @param {PackageManifest} manifest - The manifest to serialize.
     * @returns {string} The canonical JSON text that gets signed.
     */
    public static serialize(manifest: PackageManifest): string {
        return JSON.stringify({
            schema: manifest.schema,
            name: manifest.name,
            version: manifest.version,
            sha256: manifest.sha256,
            trustLevel: manifest.trustLevel,
            isAudited: manifest.isAudited
        });
    }

    /**
     * Returns the signed manifest of a stored version, signing it first if there is none yet or
     * the cached one no longer matches the registry.
     * @param {string} repoName - The name of the repository.
     * @param {string} tag - The stored version tag.
     * @returns {Promise<SignedManifest | null>} The signed manifest, or null if that version is not stored.
     * @throws {Error} If GPG signing fails, or the registry keeps changing while signing.
     */
    public static getSigned(repoName: RepositoryData['name'], tag: string): Promise<SignedManifest | null> {
        const key = `${repoName}@${tag}`;
        const pending = ManifestService.inFlight.get(key);
        if (pending) return pending;

        const work = ManifestService.resolve(repoName, tag).finally(() => ManifestService.inFlight.delete(key));
        ManifestService.inFlight.set(key, work);

        return work;
    }

    /**
     * Describes what the registry says right now about a stored version.
     * A version stored before hashes were recorded gets its hash recorded here, once.
     * @returns The serialized manifest and the path of its ZIP, or null if the version is not stored.
     */
    private static current(repoName: RepositoryData['name'], tag: string): { manifest: string; zipPath: string; details: PackageManifest } | null {
        const repository = StorageService.getRepo(repoName);
        const zipPath = StorageService.getZipPath(repoName, tag);
        if (!repository || !zipPath) return null;

        const version = Object.hasOwn(repository.versions ?? {}, tag) ? repository.versions[tag] : undefined;
        let sha256 = version?.sha256;

        if (!sha256) {
            const hash = StorageService.hashFile(zipPath);
            sha256 = hash;

            StorageService.updateRepos(repos => {
                const record = Object.hasOwn(repos, repoName) ? repos[repoName].versions?.[tag] : undefined;
                if (record && !record.sha256) record.sha256 = hash;
            });
        }

        const details: PackageManifest = {
            schema: ManifestSchema,
            name: repository.name,
            version: tag,
            sha256,
            trustLevel: repository.trustLevel,
            isAudited: version?.isAudited ?? false
        };

        return { manifest: ManifestService.serialize(details), zipPath, details };
    }

    /** Serves the cached manifest while it is still accurate, and signs a new one otherwise. */
    private static async resolve(repoName: RepositoryData['name'], tag: string): Promise<SignedManifest | null> {
        for (let attempt = 0; attempt < ManifestService.MAX_ATTEMPTS; attempt++) {
            const state = ManifestService.current(repoName, tag);
            if (!state) return null;

            const manifestPath = `${state.zipPath}.manifest.json`;
            const signaturePath = `${manifestPath}.asc`;

            if (fs.existsSync(manifestPath) && fs.existsSync(signaturePath) && fs.readFileSync(manifestPath, 'utf-8') === state.manifest) {
                return { manifest: state.manifest, signature: fs.readFileSync(signaturePath, 'utf-8') };
            }

            // The old signature goes first: a manifest must never sit next to a signature of another one.
            fs.rmSync(signaturePath, { force: true });
            fs.writeFileSync(manifestPath, state.manifest, 'utf-8');

            try {
                await SecurityService.signFile(manifestPath);
            } catch (error) {
                fs.rmSync(manifestPath, { force: true });
                fs.rmSync(signaturePath, { force: true });
                throw error;
            }

            // Signing takes a moment: the signature only stands if the registry still says the same.
            if (ManifestService.current(repoName, tag)?.manifest !== state.manifest) continue;

            AuditLog.record('package.manifest-signed', {
                package: repoName,
                tag,
                sha256: state.details.sha256,
                trustLevel: state.details.trustLevel,
                isAudited: state.details.isAudited
            });

            return { manifest: state.manifest, signature: fs.readFileSync(signaturePath, 'utf-8') };
        }

        throw new Error("El registro cambió mientras se firmaba el manifiesto.");
    }
}
