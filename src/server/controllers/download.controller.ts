import { Request, Response } from 'express';
import semver from 'semver';
import Version from '../../utils/version-instance';
import { getComponentFileName, type Component, type System } from '../../utils/utils';
import { getAssetDigests } from '../../utils/release-assets';

const repos: Record<Component, string> = {
    compiler: 'DisChord',
    cli: 'DischordCLI',
    ide: 'DisChord-Code-Studio'
};

const systems: readonly System[] = [ 'windows', 'linux', 'macos' ];

const isComponent = (value: string): value is Component => Object.hasOwn(repos, value);
const isSystem = (value: string): value is System => (systems as readonly string[]).includes(value);

interface ResolvedDownload {
    repo: string;
    tag: string;
    fileName: string;
}

/**
 * Resolves which asset of which release a `/download/:component/:version/:os` request means, for both
 * the redirect and its checksum, so the two always talk about the same file.
 * Every parameter ends up inside a URL, so each one is checked against a closed list (or semver) first:
 * anything else could point the redirect elsewhere. Answers 400/503 itself and returns `undefined`.
 */
function resolveDownload(req: Request, res: Response): ResolvedDownload | undefined {
    const component = String(req.params.component);
    const version = String(req.params.version);
    const os = String(req.params.os);

    if (!isComponent(component)) return void res.status(400).json({ message: "Invalid component" });
    if (!isSystem(os)) return void res.status(400).json({ message: "Invalid os" });
    if (version !== 'latest' && !semver.valid(version)) return void res.status(400).json({ message: "Invalid version" });

    const tag = version === 'latest' ? Version[component] : version;
    if (!tag || !semver.valid(tag)) return void res.status(503).json({ message: "Latest version not available yet" });

    const userAgent = String(req.headers['user-agent'] ?? '');

    return { repo: repos[component], tag, fileName: getComponentFileName(component, tag, os, userAgent) };
}

/** Redirects to the release asset on GitHub. */
export const downloadComponent = (req: Request, res: Response) => {
    const download = resolveDownload(req, res);
    if (!download) return;

    return res.redirect(`https://github.com/DisChord-Org/${download.repo}/releases/download/${encodeURIComponent(download.tag)}/${encodeURIComponent(download.fileName)}`);
};

/**
 * Answers the SHA-256 GitHub published for the file the download route redirects to, so clients can
 * verify it. It comes from the same release as the file: it catches corrupted or intercepted
 * downloads, not a compromised release.
 */
export const componentChecksum = async (req: Request, res: Response) => {
    const download = resolveDownload(req, res);
    if (!download) return;

    let digests;
    try {
        digests = await getAssetDigests(download.repo, download.tag);
    } catch (error) {
        console.error('Error al leer los checksums de GitHub:', error);
        return res.status(502).json({ message: "Could not read the release from GitHub" });
    }

    if (!digests) return res.status(404).json({ message: `Release ${download.tag} not found` });

    const sha256 = Object.hasOwn(digests, download.fileName) ? digests[download.fileName] : undefined;
    if (!sha256) return res.status(404).json({ message: `No checksum available for ${download.fileName} in release ${download.tag}` });

    return res.json({ file: download.fileName, tag: download.tag, sha256 });
};

const IdeUpdateUrl = 'https://github.com/DisChord-Org/DisChord-Code-Studio/releases/latest/download/latest.json';
const IdeUpdateTtlMs = 60 * 1000;

interface IdeUpdateConfig {
    version?: unknown;
    [key: string]: unknown;
}

let ideUpdateCache: { config: IdeUpdateConfig | null; expires: number } | undefined;

async function getIdeUpdateConfig(): Promise<IdeUpdateConfig | null> {
    const now = Date.now();
    if (ideUpdateCache && now < ideUpdateCache.expires) return ideUpdateCache.config;

    let config: IdeUpdateConfig | null = null;
    const response = await fetch(IdeUpdateUrl, { signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
        const body: unknown = await response.json();
        if (body && typeof body === 'object') config = body as IdeUpdateConfig;
    }

    ideUpdateCache = { config, expires: now + IdeUpdateTtlMs };
    return config;
}

export const checkIdeUpdate = async (req: Request, res: Response) => {
    const { version } = req.params;

    if (!version || typeof version != 'string' || !semver.valid(version)) {
        return res.status(400).json({ error: 'Versión actual inválida o no proporcionada' });
    }

    try {
        const remoteConfig = await getIdeUpdateConfig();

        if (!remoteConfig || typeof remoteConfig.version !== 'string' || !semver.valid(remoteConfig.version)) {
            return res.status(204).send();
        }

        if (semver.gt(remoteConfig.version, version)) {
            return res.json(remoteConfig);
        }

        return res.status(204).send();
    } catch (error) {
        console.error("Error al checkear update:", error);
        return res.status(204).send();
    }
};
