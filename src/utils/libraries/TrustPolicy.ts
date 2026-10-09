import { RepositoryData, TrustLevel } from "./types";

/**
 * Pure rules that decide what the server may do with a package depending on its TrustLevel.
 * Kept free of I/O so it can be unit tested.
 */
export class TrustPolicy {
    /**
     * Whether a version tag may be downloaded: Trust and above accept any tag,
     * Unknown repositories only accept tags present in their whitelist.
     */
    public static isVersionAllowed(repository: RepositoryData, version: string): boolean {
        if (repository.trustLevel >= TrustLevel.Trust) return true;
        if (repository.trustLevel === TrustLevel.Unknown) return repository.allowedVersions.includes(version);
        return false;
    }

    /** Whether freshly downloaded packages are signed automatically (Trust ones wait for a manual audit). */
    public static signsOnDownload(trustLevel: TrustLevel): boolean {
        return trustLevel !== TrustLevel.Trust;
    }

    /** Whether the level can be audited manually with the `sg` command. */
    public static canBeAudited(trustLevel: TrustLevel): boolean {
        return trustLevel >= TrustLevel.Trust;
    }

    /**
     * Parses the level names accepted by the Discord commands (`official|o`, `trust|t`, `unknown|u`).
     * @returns The matching TrustLevel, or undefined if the text is not a level.
     */
    public static parseLevel(input: string): TrustLevel | undefined {
        switch (input.toLowerCase()) {
            case 'official':
            case 'o':
                return TrustLevel.Official;
            case 'trust':
            case 't':
                return TrustLevel.Trust;
            case 'unknown':
            case 'u':
                return TrustLevel.Unknown;
            default:
                return undefined;
        }
    }
}
