/** SHA-256 (hex) of every asset of a release that GitHub published a digest for, by asset name. */
export type AssetDigests = Record<string, string>;

interface CacheEntry {
    /** `null` when GitHub has no such release. */
    digests: AssetDigests | null;
    expires: number;
}

/** A published release never changes its assets' content, so found releases are kept for a while. */
const FoundTtlMs = 10 * 60 * 1000;
/** A missing release may be published at any moment, but asking again on every request would let anyone spend the API quota. */
const MissingTtlMs = 60 * 1000;
/** The tag comes from the URL, so the cache must not grow with every version somebody invents. */
const MaxEntries = 200;

const cache = new Map<string, CacheEntry>();

const DigestPattern = /^sha256:([0-9a-f]{64})$/i;

/**
 * Reads the digests of a release's assets from the GitHub API, caching the answer per repository and tag.
 * Uses `GITHUB_TOKEN` when present, to stay clear of the unauthenticated rate limit.
 * @param repo Repository name inside the DisChord-Org organization.
 * @param tag Release tag.
 * @returns The digests by asset name, or `null` if the release does not exist.
 * @throws {Error} If GitHub cannot be reached or answers with an error other than 404 (never cached).
 */
export async function getAssetDigests(repo: string, tag: string): Promise<AssetDigests | null> {
    const key = `${repo}@${tag}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now < cached.expires) return cached.digests;

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'DisChord-Server'
    };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

    const url = `https://api.github.com/repos/DisChord-Org/${repo}/releases/tags/${encodeURIComponent(tag)}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });

    let digests: AssetDigests | null = null;
    if (response.ok) {
        const release = await response.json() as { assets?: unknown } | null;
        digests = {};

        for (const asset of Array.isArray(release?.assets) ? release.assets as { name?: unknown; digest?: unknown }[] : []) {
            const hex = typeof asset?.digest === 'string' ? DigestPattern.exec(asset.digest)?.[1] : undefined;
            if (typeof asset?.name === 'string' && hex) digests[asset.name] = hex.toLowerCase();
        }
    } else if (response.status !== 404) {
        throw new Error(`Error de GitHub API: ${response.status} ${response.statusText}`);
    }

    if (cache.size >= MaxEntries && !cache.has(key)) cache.delete(cache.keys().next().value as string);
    cache.set(key, { digests, expires: now + (digests ? FoundTtlMs : MissingTtlMs) });

    return digests;
}
