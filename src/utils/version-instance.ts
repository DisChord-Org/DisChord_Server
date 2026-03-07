import pkg from '../../package.json';

class Version {
    public static server: string = '';
    public static compiler: string = '';
    public static cli: string = '';
    public static ide: string = '';

    constructor () {
        this.updateVersions();
    }

    private async fetchLatestVersion (repo: 'DisChord' | 'DisChordCLI' | 'DisChord-Code-Studio'): Promise<string> {
        const url = `https://api.github.com/repos/DisChord-Org/${repo}/releases/latest`;
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

        const headers: HeadersInit = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'DisChord-IDE-App',
            'Authorization': `token ${GITHUB_TOKEN}`
        };

        const response = await fetch(url, { headers });

        if (!response.ok) throw new Error(`Error al obtener release: ${response.statusText}`);

        const data = await response.json();
        return data.tag_name;
    }

    private async updateVersions() {
        Version.server = `v${pkg.version}`;
        Version.compiler = await this.fetchLatestVersion('DisChord');
        Version.cli = await this.fetchLatestVersion('DisChordCLI');
        Version.ide = await this.fetchLatestVersion('DisChord-Code-Studio');
    }
}

new Version();

export default Version;