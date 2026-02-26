export function getComponentFileName (component: 'cli' | 'ide' | 'compiler', version: string, os: 'windows' | 'linux') {
    if (os === 'windows') {
        return `${component}-v${version}-win-x64.exe`;
    } else {
        return `${component}-v${version}-linux`;
    }
}