export function getComponentFileName(component: 'cli' | 'ide' | 'compiler', version: string, os: 'windows' | 'linux' | 'macos', userAgent: string = '') {
    if (component !== 'ide') {
        const binaryName = component === 'cli' ? 'chord' : 'dischord-compiler';
        if (os === 'windows') return `${binaryName}-x86_64-pc-windows-msvc.exe`;
        if (os === 'macos') return `${binaryName}-aarch64-apple-darwin`;
        return `${binaryName}-x86_64-unknown-linux-gnu`;
    }

    const prefix = "dischord-code-studio";

    if (os === 'windows') return `${prefix}_${version}_x64-setup.exe`;
    if (os === 'macos') return `${prefix}_${version}_aarch64.dmg`;

    if (os === 'linux') {
        if (userAgent.includes('Ubuntu') || userAgent.includes('Debian')) return `${prefix}_${version}_amd64.deb`;
        return `${prefix}-${version}-1.x86_64.rpm`;
    }

    return `${prefix}_${version}_amd64.deb`;
}

export function isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
    const [lMajor, lMinor, lPatch] = parse(latest);
    const [cMajor, cMinor, cPatch] = parse(current);

    if (lMajor > cMajor) return true;
    if (lMajor < cMajor) return false;
    if (lMinor > cMinor) return true;
    if (lMinor < cMinor) return false;
    return lPatch > cPatch;
}

/**
 * @deprecated
*/
export async function getSignatureFromGitHub(version: string, platform: string): Promise<string> {
    const extensionMap: Record<string, string> = {
        'windows-x86_64': 'msi.zip.sig',
        'darwin-aarch64': 'app.tar.gz.sig',
        'darwin-x86_64': 'app.tar.gz.sig',
        'linux-x86_64': 'AppImage.tar.gz.sig'
    };

    const suffix = extensionMap[platform];
    if (!suffix) return "";

    const fileName = `dischord-code-studio.${suffix}`;
    const url = `https://github.com/tu-usuario/tu-repo/releases/download/v${version}/${fileName}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Firma no encontrada (${response.status}) para la versión ${version}`);
            return "";
        }

        const signature = await response.text();
        return signature.trim();
    } catch (error) {
        console.error("Error de red al obtener la firma de GitHub:", error);
        return "";
    }
}