import { describe, expect, it } from 'vitest';
import { getComponentFileName } from '../src/utils/utils';

/** Assets published in the DisChord-Code-Studio release v1.18.0. Asset names are exact and case-sensitive. */
const ideAssets = [
    'DisChord.Code.Studio_1.18.0_x64-setup.exe',
    'DisChord.Code.Studio_1.18.0_aarch64.dmg',
    'DisChord.Code.Studio_1.18.0_amd64.deb',
    'DisChord.Code.Studio-1.18.0-1.x86_64.rpm'
];

describe('getComponentFileName', () => {
    it('builds IDE names that exist in the release, for every OS', () => {
        const built = [
            getComponentFileName('ide', 'v1.18.0', 'windows'),
            getComponentFileName('ide', 'v1.18.0', 'macos'),
            getComponentFileName('ide', 'v1.18.0', 'linux', 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64)'),
            getComponentFileName('ide', 'v1.18.0', 'linux', 'Mozilla/5.0 (X11; Fedora; Linux x86_64)')
        ];

        expect(built).toEqual(ideAssets);
    });

    it('strips the leading v of the tag, and accepts a version without it', () => {
        expect(getComponentFileName('ide', 'v1.18.0', 'windows')).toBe(getComponentFileName('ide', '1.18.0', 'windows'));
        expect(getComponentFileName('ide', 'v1.18.0', 'macos')).not.toContain('v1.18.0');
    });

    it('picks .deb only for Debian and Ubuntu user agents', () => {
        expect(getComponentFileName('ide', 'v1.18.0', 'linux', 'Debian APT-HTTP/1.3')).toMatch(/\.deb$/);
        expect(getComponentFileName('ide', 'v1.18.0', 'linux', 'ubuntu')).toMatch(/\.deb$/);
        expect(getComponentFileName('ide', 'v1.18.0', 'linux')).toMatch(/\.rpm$/);
        expect(getComponentFileName('ide', 'v1.18.0', 'linux', 'curl/8.5.0')).toMatch(/\.rpm$/);
    });

    it('keeps the CLI and compiler binaries, which do not carry the version', () => {
        expect(getComponentFileName('cli', 'v1.7.7', 'windows')).toBe('chord-x86_64-pc-windows-msvc.exe');
        expect(getComponentFileName('cli', 'v1.7.7', 'macos')).toBe('chord-aarch64-apple-darwin');
        expect(getComponentFileName('cli', 'v1.7.7', 'linux')).toBe('chord-x86_64-unknown-linux-gnu');
        expect(getComponentFileName('compiler', 'v1.0.0', 'linux')).toBe('dischord-compiler-x86_64-unknown-linux-gnu');
    });
});
