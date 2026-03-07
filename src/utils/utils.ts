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