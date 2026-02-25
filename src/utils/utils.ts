import Commander from "./commander";

export function getComponentFileName (component: 'cli' | 'ide' | 'compiler', version: string) {
    if (Commander.isWindows) {
        return `${component}-v${version}-win-x64.exe`;
    } else {
        return `${component}-v${version}-linux`;
    }
}