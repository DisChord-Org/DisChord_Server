import pkg from '../../package.json';

class Version {
    public static server: string = `v${pkg.version}`;
    public static compiler: string = '';
    public static cli: string = '';
    public static ide: string = '';

    constructor () {
        Version.refresh().catch(err => console.error('Error al actualizar versiones:', err));
    }

    public static async fetchLatestVersion (repo: 'DisChord' | 'DisChordCLI' | 'DisChord-Code-Studio' | 'DisChord_Server'): Promise<string> {
        const url = `https://api.github.com/repos/DisChord-Org/${repo}/releases/latest`;

        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'DisChord-IDE-App'
        };
        if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

        const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });

        if (!response.ok) throw new Error(`Error al obtener release: ${response.statusText}`);

        const data = await response.json() as { tag_name?: unknown };
        if (typeof data?.tag_name !== 'string') throw new Error(`La release de ${repo} no tiene tag.`);

        return data.tag_name;
    }

    /**
     * Asks GitHub for the three component versions. Each one is updated on its own, so a failure
     * keeps the last known value of that component instead of leaving the others stale or empty.
     * @throws The first error, after every version that could be read has been stored.
     */
    public static async refresh() {
        Version.server = `v${pkg.version}`;

        const [ compiler, cli, ide ] = await Promise.allSettled([
            Version.fetchLatestVersion('DisChord'),
            Version.fetchLatestVersion('DisChordCLI'),
            Version.fetchLatestVersion('DisChord-Code-Studio')
        ]);

        if (compiler.status === 'fulfilled') Version.compiler = compiler.value;
        if (cli.status === 'fulfilled') Version.cli = cli.value;
        if (ide.status === 'fulfilled') Version.ide = ide.value;

        const failed = [ compiler, cli, ide ].find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
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
