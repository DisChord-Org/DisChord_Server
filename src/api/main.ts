import express from 'express';
import runtime from '../utils/runtime-instance';
import { getComponentFileName } from 'src/utils/utils';
import Version from '../utils/version-instance';

const app = express();
const PORT = runtime === 'dev'? 3000 : 45350;

app.use(express.json());

app.get('/versions', (_req, res) => {
    return res.json({
        server: Version.server,
        compiler: Version.compiler,
        cli: Version.cli,
        ide: Version.ide
    });
});

app.get('/download/:component/:version', (req, res) => {
    const { component, version } = req.params;
    const userAgent = req.headers['user-agent'] || '';

    let os: 'windows' | 'linux' | 'macos' = 'linux';
    if (userAgent.includes('Win')) os = 'windows';
    else if (userAgent.includes('Mac')) os = 'macos';
    
    const repos = {
        compiler: 'DisChord',
        cli: 'DischordCLI',
        ide: 'DisChord-Code-Studio'
    };

    const repoName = repos[component as keyof typeof repos];
    if (!repoName) return res.status(400).json({ message: "Invalid component" });

    let targetVersion = version;
    if (version === 'latest') targetVersion = Version[component as keyof typeof repos];

    const fileName = getComponentFileName(component as 'cli' | 'ide' | 'compiler', targetVersion, os, userAgent);
    const githubUrl = `https://github.com/DisChord-Org/${repoName}/releases/download/${targetVersion}/${fileName}`;

    return res.redirect(githubUrl);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
