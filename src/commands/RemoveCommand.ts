import { Declare, Command, type CommandContext, Options, createStringOption, Middlewares, Embed } from 'seyfert';
import { existsSync, lstatSync, readdirSync, rmSync } from 'fs';
import path from 'path';

@Declare({
    name: 'remove',
    description: 'Remove a repository from the server',
    integrationTypes: [ 'GuildInstall' ],
})

@Options({
    repository: createStringOption({
        description: 'Repository Name (not URL)',
        required: true,
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
    })
})

@Middlewares(['staff'])

export default class RemoveCommand extends Command {
    async run(ctx: CommandContext | any) {
        const dependencyName = ctx.options.repository;
        const dependencyType = ctx.options.dependencytype;
        const dependenciesPath = path.join(__dirname, '../../dependencies');

        try {
            if (dependencyType) {
                const dependencyPath = path.join(dependenciesPath, dependencyType, dependencyName);

                if (!existsSync(dependencyPath)) return await ctx.write({
                    embeds: [
                        new Embed()
                        .setColor(`#${process.env.PRIMARY}`)
                        .setDescription(`La dependencia \`${dependencyName}\` no existe en \`${dependencyType}\`.`),
                    ]
                });

                rmSync(dependencyPath, { recursive: true });

                await ctx.write({
                    embeds: [
                        new Embed()
                        .setColor(`#${process.env.PRIMARY}`)
                        .setDescription(`La dependencia \`${dependencyName}\` ha sido eliminada de \`${dependencyType}\`.`),
                    ]
                });

            } else {

                const dependencyTypes = readdirSync(dependenciesPath).filter(file => lstatSync(path.join(dependenciesPath, file)).isDirectory());

                let found = false;

                for (const type of dependencyTypes) {
                    const dependencyPath = path.join(dependenciesPath, type, dependencyName);
                    if (existsSync(dependencyPath)) {

                        if (!existsSync(dependencyPath)) return await ctx.write({
                            embeds: [
                                new Embed()
                                .setColor(`#${process.env.PRIMARY}`)
                                .setDescription(`La dependencia \`${dependencyName}\` no existe en \`${dependencyType}\`.`),
                            ]
                        });

                        rmSync(dependencyPath, { recursive: true });

                        await ctx.write({
                            embeds: [
                                new Embed()
                                .setColor(`#${process.env.PRIMARY}`)
                                .setDescription(`La dependencia \`${dependencyName}\` ha sido eliminada de \`${dependencyType}\`.`),
                            ]
                        });

                        found = true;
                        break;
                    }
                }

                if (!found) {
                    return await ctx.write({
                        embeds: [
                            new Embed()
                            .setColor(`#${process.env.PRIMARY}`)
                            .setDescription(`La dependencia \`${dependencyName}\` no existe.`),
                        ],
                    });
                }
            }
        } catch (error) {
            await ctx.editResponse({
                embeds: [
                    new Embed()
                    .setColor(`#${process.env.PRIMARY}`)
                    .setDescription(`Ocurrió un error al eliminar la dependencia \`${dependencyName}\``),
                ],
            });
        }
    }
}