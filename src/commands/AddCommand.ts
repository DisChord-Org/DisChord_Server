import { Declare, Command, type CommandContext, Options, createStringOption, createUserOption, Middlewares, Embed } from 'seyfert';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import axios from 'axios';
import { createHash } from 'crypto';
import openpgp from 'openpgp';

@Declare({
    name: 'add',
    description: 'Add a repository to the server',
    integrationTypes: [ 'GuildInstall' ],
})

@Options({
    repository: createStringOption({
        description: 'Repository URL',
        required: true
    }),

    dependencytype: createStringOption({
        description: 'The trusted type',
        choices: [
            {
                name: 'Official',
                value: 'official'
            },
            {
                name: 'Trust',
                value: 'trust'
            },
            {
                name: 'Unknown',
                value: 'unknown'
            }
        ],
        required: true
    }),

    author: createUserOption({
        description: 'The dependency author',
        required: true
    })
})

@Middlewares(['staff'])

export default class AddCommand extends Command {
    async run(ctx: CommandContext | any) {
        if (!ctx.options.repository.startsWith('https://github.com/')) return await ctx.write({
            content: `Se debe especificar una URL de un repositorio de GitHub.`
        });

        await ctx.write({
            embeds: [
                new Embed()
                .setColor(`#${process.env.PRIMARY}`)
                .setDescription(`Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\``)
            ]
        });

        if (!existsSync(path.join(__dirname, '../../dependencies/'))) mkdirSync(path.join(__dirname, '../../dependencies/'));
        if (!existsSync(path.join(__dirname, '../../dependencies/official/'))) mkdirSync(path.join(__dirname, '../../dependencies/official/'));
        if (!existsSync(path.join(__dirname, '../../dependencies/trust/'))) mkdirSync(path.join(__dirname, '../../dependencies/trust/'));
        if (!existsSync(path.join(__dirname, '../../dependencies/unknown/'))) mkdirSync(path.join(__dirname, '../../dependencies/unknown/'));

        const dependency = {
            name: ctx.options.repository.split('/').slice(-1)[0],
            author: ctx.options.repository.split('/').slice(-2)[0],
            version: undefined
        };

        await ctx.editResponse({
            embeds: [
                new Embed()
                .setColor(`#${process.env.PRIMARY}`)
                .setDescription(`
                    Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                    Obteniendo versión de \`${dependency.name}\`
                `)
            ]
        });

        const response: any = await axios.get(`https://api.github.com/repos/${dependency.author}/${dependency.name}/contents/package.json`);

        if (response.status === 200) {
            const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
            dependency.version = JSON.parse(content).version;
        } else return await ctx.editResponse({
            embeds: [
                new Embed()
                .setColor(`#${process.env.PRIMARY}`)
                .setDescription(`
                    Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                    Error al obtener la versión de \`${dependency.name}\`
                `)
            ]
        });

        await ctx.editResponse({
            embeds: [
                new Embed()
                .setColor(`#${process.env.PRIMARY}`)
                .setDescription(`
                    Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                    Versión actual obtenida \`${dependency.version}\`
                    Clonando en \`/dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                `)
            ]
        });

        if (!existsSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}`))) mkdirSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}`));
        if (existsSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/`))) return await ctx.editResponse({
            embeds: [
                new Embed()
                .setColor(`#${process.env.PRIMARY}`)
                .setDescription(`
                    Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                    Versión actual obtenida \`${dependency.version}\`
                    Error, la carpeta \`.../${dependency.name}/${dependency.version}/\` ya existe
                `)
            ]
        });
        if (!existsSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/`))) mkdirSync((path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/`)));

        exec(`git clone ${ctx.options.repository} ${path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/`)}`, (async error => {
            if (error) return await ctx.editResponse({
                embeds: [
                    new Embed()
                    .setColor(`#${process.env.PRIMARY}`)
                    .setDescription(`
                        Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                        Versión actual obtenida \`${dependency.version}\`
                        Error al clonar el repositorio
                    `)
                ]
            });

            await ctx.editResponse({
                embeds: [
                    new Embed()
                    .setColor(`#${process.env.PRIMARY}`)
                    .setDescription(`
                        Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                        Versión actual obtenida \`${dependency.version}\`
                        Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                        Generando hashes
                    `)
                ]
            });

            try {
                const hashes: { [nombre: string]: string } = {};

                function generateHashes(route: string) {
                    const src = readdirSync(route);

                    for (const file of src) {
                        if (file === '.git') continue;

                        const newRoute = path.join(route, file);

                        if (statSync(newRoute).isDirectory()) generateHashes(newRoute);
                        else {
                            const content = readFileSync(newRoute);
                            const hash = createHash('sha256').update(content).digest('hex');
                            hashes[file] = hash;
                        }
                    }
                }

                generateHashes(path.join(__dirname, ctx.options.dependencytype === 'unknown'? `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/` : `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/`));

                const contentFile = Object.entries(hashes).map(([nombre, hash]) => `${hash}  ${nombre}`).join('\n');

                writeFileSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash`), contentFile);

            } catch (error) {
                return await ctx.editResponse({
                    embeds: [
                        new Embed()
                        .setColor(`#${process.env.PRIMARY}`)
                        .setDescription(`
                            Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                            Versión actual obtenida \`${dependency.version}\`
                            Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                            Error al generar hashes.
                        `)
                    ]
                });
            }

            await ctx.editResponse({
                embeds: [
                    new Embed()
                    .setColor(`#${process.env.PRIMARY}`)
                    .setDescription(`
                        Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                        Versión actual obtenida \`${dependency.version}\`
                        Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                        Hashes generados en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash\`
                        Firmando fichero de hashes
                    `)
                ]
            });

            try {
                const privateKeyArmored = readFileSync(path.join(__dirname, '../../privatesign.asc'), 'utf8'); 
                const data = readFileSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash`), 'utf8');

                const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });

                const decryptedKey = await openpgp.decryptKey({
                    privateKey,
                    passphrase: process.env.GPG_PASSWORD,
                });

                const message = await openpgp.createMessage({ text: data });

                const signature = await openpgp.sign({
                    message,
                    signingKeys: decryptedKey,
                    detached: true,
                });

                writeFileSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/signature`), signature);
            } catch (error) {
                await ctx.editResponse({
                    embeds: [
                        new Embed()
                        .setColor(`#${process.env.PRIMARY}`)
                        .setDescription(`
                            Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                            Versión actual obtenida \`${dependency.version}\`
                            Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                            Hashes generados en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash\`
                            Error al firmar el fichero hash
                        `)
                    ]
                });
            }

            await ctx.editResponse({
                embeds: [
                    new Embed()
                    .setColor(`#${process.env.PRIMARY}`)
                    .setDescription(`
                        Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                        Versión actual obtenida \`${dependency.version}\`
                        Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                        Hashes generados en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash\`
                        Firma generada en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/signature\`
                        Generando información restante
                    `)
                ]
            });

            writeFileSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/version`), `${dependency.version}`);
            writeFileSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/repo`), `${ctx.options.repository}`);
            writeFileSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/author.json`), `${ctx.options.author.user}`);

            await ctx.editResponse({
                embeds: [
                    new Embed()
                    .setColor(`#${process.env.PRIMARY}`)
                    .setDescription(`
                        Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                        Versión actual obtenida \`${dependency.version}\`
                        Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                        Hashes generados en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash\`
                        Firma generada en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/signature\`
                        Ficheros creados \`version\`, \`repo\`, \`author.json\`
                    `)
                ]
            });

            if (ctx.options.dependencytype != 'unknown') {
                await ctx.editResponse({
                    embeds: [
                        new Embed()
                        .setColor(`#${process.env.PRIMARY}`)
                        .setDescription(`
                            Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                            Versión actual obtenida \`${dependency.version}\`
                            Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                            Hashes generados en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash\`
                            Firma generada en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/signature\`
                            Ficheros creados \`version\`, \`repo\`, \`author.json\`
                            Borrando src
                        `)
                    ]
                });

                if (existsSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/`))) rmSync(path.join(__dirname, `../../dependencies/${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/`), { recursive: true });

                await ctx.editResponse({
                    embeds: [
                        new Embed()
                        .setColor(`#${process.env.PRIMARY}`)
                        .setDescription(`
                            Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                            Versión actual obtenida \`${dependency.version}\`
                            Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                            Hashes generados en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash\`
                            Firma generada en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/signature\`
                            Ficheros creados \`version\`, \`repo\`, \`author.json\`
                            Carpeta borrada \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                            La dependencia \`${dependency.name}\` se ha agregado en el servidor correctamente
                        `)
                    ]
                });
            } else {
                await ctx.editResponse({
                    embeds: [
                        new Embed()
                        .setColor(`#${process.env.PRIMARY}`)
                        .setDescription(`
                            Agregando \`${ctx.options.repository}\` como \`${ctx.options.dependencytype}\`
                            Versión actual obtenida \`${dependency.version}\`
                            Repositorio clonado en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/src/\`
                            Hashes generados en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/hash\`
                            Firma generada en \`.../${ctx.options.dependencytype}/${dependency.name}/${dependency.version}/signature\`
                            Ficheros creados \`version\`, \`repo\`, \`author.json\`
                            La dependencia \`${dependency.name}\` se ha agregado en el servidor correctamente
                        `)
                    ]
                });
            }
        }));
    }
};