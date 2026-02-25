import express from 'express';
import path from 'path';
import fs from 'fs';
import runtime from '../runtime-instance';
import { getComponentFileName } from 'src/utils/utils';

const app = express();
const PORT = runtime === 'dev'? 3000 : 45350;
const ASSETS_PATH = runtime === 'dev'? path.join(process.cwd(), '/releases-test/releases') : '/var/www/dischord-assets/releases';

app.use(express.json());

app.get('/version/:component', (req, res) => {
    const { component } = req.params;
    if (![ 'compiler', 'ide', 'cli' ].includes(component)) return res.status(400).json({ message: "Invalid component" });

    const releasesPath: string = path.join(ASSETS_PATH, component, 'version.json');
    const versionFile = fs.readFileSync(releasesPath, 'utf-8');
    const { version, critical } = JSON.parse(versionFile);

    return res.json({ version, critical });
});

app.get('/download/:component/:version', (req, res) => {
    const { component, version } = req.params;
    if (![ 'compiler', 'ide', 'cli' ].includes(component)) return res.status(400).json({ message: "Invalid component" });
    
    const releasePath: string = path.join(ASSETS_PATH, component, getComponentFileName(component as 'cli' | 'ide' | 'compiler', version));
    if (!fs.existsSync(releasePath)) return res.status(400).json({ message: 'Invalid version or component' });
    
    return res.download(releasePath);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
