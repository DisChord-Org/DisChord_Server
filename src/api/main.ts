import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 3000;

app.get('/dependencies/find/:name', (req: any, res: any) => {
    const { name } = req.params;

    if (!fs.existsSync(path.join(__dirname, '../../dependencies/'))) return res.status(500).send({ message: 'Error: La carpeta de dependencias no existe' });

    const dependencyTypes = fs.readdirSync(path.join(__dirname, '../../dependencies/')).filter(file => fs.lstatSync(path.join(__dirname, '../../dependencies/', file)).isDirectory());

    let found = false;

    for (const type of dependencyTypes) {
        const dependencyPath = path.join(__dirname, '../../dependencies/', type, name);
        if (fs.existsSync(dependencyPath)) {

            if (fs.existsSync(dependencyPath)) {
                const versions = fs.readdirSync(dependencyPath);
                const versionsSorted = versions.sort((a, b) => {
                    const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
                    const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
                
                    if (aMajor !== bMajor) return aMajor - bMajor;
                    if (aMinor !== bMinor) return aMinor - bMinor;
                    return aPatch - bPatch;
                });                

                res.status(200).send({
                    path: dependencyPath,
                    tpye: type,
                    versions: versionsSorted,
                    actualVersion: versionsSorted[versionsSorted.length - 1]
                });

                found = true;
                break;
            }
        }
    }

    if (!found) res.status(404).send({ error: 'Dependencia no encontrada.' });
});

app.get('/dependencies/:type/:name/:version', (req: any, res: any) => {
    const { type, name, version } = req.params;
    const dependencyPath = path.join(__dirname, `../../dependencies/${type}/${name}/${version}/`);

    if (!fs.existsSync(dependencyPath)) {
        return res.status(404).json({ error: "Dependency not found" });
    }

    const files = fs.readdirSync(dependencyPath).map(file => ({
        name: file,
        url: `http://localhost:${PORT}/download/${type}/${name}/${version}/${file}`
    }));

    res.json({ files });
});

app.get('/download/:type/:name/:version/:file', (req: any, res: any) => {
    const { type, name, version, file } = req.params;
    const filePath = path.join(__dirname, `../../dependencies/${type}/${name}/${version}/${file}`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }

    res.download(filePath);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
