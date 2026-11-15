export type Component = 'cli' | 'ide' | 'compiler';
export type System = 'windows' | 'linux' | 'macos';

/** Prefix of the IDE assets exactly as the DisChord-Code-Studio releases publish them (asset names are case-sensitive). */
const IdeAssetPrefix = 'DisChord.Code.Studio';

/**
 * Name of the release asset to download for a component.
 * @param version The release tag or version; IDE asset names carry it without the leading `v`.
 * @param userAgent Only used for the IDE on Linux: Debian and Ubuntu get the `.deb`, everyone else the `.rpm`.
 */
export function getComponentFileName(component: Component, version: string, os: System, userAgent: string = '') {
    if (component !== 'ide') {
        const binaryName = component === 'cli' ? 'chord' : 'dischord-compiler';
        if (os === 'windows') return `${binaryName}-x86_64-pc-windows-msvc.exe`;
        if (os === 'macos') return `${binaryName}-aarch64-apple-darwin`;
        return `${binaryName}-x86_64-unknown-linux-gnu`;
    }

    const number = version.replace(/^v/i, '');

    if (os === 'windows') return `${IdeAssetPrefix}_${number}_x64-setup.exe`;
    if (os === 'macos') return `${IdeAssetPrefix}_${number}_aarch64.dmg`;

    if (/ubuntu|debian/i.test(userAgent)) return `${IdeAssetPrefix}_${number}_amd64.deb`;
    return `${IdeAssetPrefix}-${number}-1.x86_64.rpm`;
}
