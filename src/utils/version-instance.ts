import pkg from '../../package.json';

class Version {
    public static server: string = '';
    public static compiler: string = '';
    public static cli: string = '';
    public static ide: string = '';

    constructor () {
        Version.refresh().catch(err => console.error('Error al actualizar versiones:', err));
    }

    public static async fetchLatestVersion (repo: 'DisChord' | 'DisChordCLI' | 'DisChord-Code-Studio' | 'DisChord_Server'): Promise<string> {
        const url = `https://api.github.com/repos/DisChord-Org/${repo}/releases/latest`;

        const headers: HeadersInit = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'DisChord-IDE-App',
            'Authorization': `token ${process.env.GITHUB_TOKEN}`
        };

        const response = await fetch(url, { headers });

        if (!response.ok) throw new Error(`Error al obtener release: ${response.statusText}`);

        const data = await response.json();
        return data.tag_name;
    }

    public static async refresh() {
        Version.server = `v${pkg.version}`;
        Version.compiler = await Version.fetchLatestVersion('DisChord');
        Version.cli = await Version.fetchLatestVersion('DisChordCLI');
        Version.ide = await Version.fetchLatestVersion('DisChord-Code-Studio');
    }

    public static toJSON() {
        return {
            server: Version.server,
            compiler: Version.compiler,
            cli: Version.cli,
            ide: Version.ide
        };
    }
}

new Version();

export default Version;