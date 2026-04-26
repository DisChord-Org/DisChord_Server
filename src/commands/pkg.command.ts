import { Middlewares, Declare, Command, type CommandContext, IgnoreCommand } from 'seyfert';
import { LibraryManagerInstance, TrustLevel } from 'src/utils/LibraryManager';

@Declare({
    name: "pkg",
    description: "Gestiona los paquetes del servidor",
    ignore: IgnoreCommand.Slash
})

@Middlewares([ 'staff' ])

export default class PingCommand extends Command {
    private content: string[] = ['# Introduzca comandos para la gestión de paquetes', 'stp (stop) | cls (clear) | add | lst (list) [pkg] | del (delete) | md (modify) | illw (is-allowed)\nllw (allow-with-download) | gv (get-version)'];

    private addContent(args: string[], message: string, addEndIndicator: boolean = true): string {
        if (this.content.length >= 12) this.content.splice(2, 1);
        this.content.push(`> ${args.join(' ')}`, `${message}`);
        return this.getContent(addEndIndicator);
    }

    private getContent(addEndIndicator: boolean = true): string {
        const content = `\`\`\`bash\n${this.content.join('\n')}${addEndIndicator ? '\n> ' : ''}\`\`\``;
        if (content.length > 2000) return 'El contenido es demasiado largo para ser mostrado.';

        return content;
    }

    async run(ctx: CommandContext) {
        const message = await ctx.write({ content: this.getContent() }, true);
        
        ctx.client.collectors.create({
            event: 'MESSAGE_CREATE',
            filter: (arg) => arg.author.id === ctx.author.id,
            timeout: 60000,
            run: async (arg, stop): Promise<void> => {
                const args = arg.content.trim().split(/\s+/);
                const command = args[0]?.toLowerCase();
                arg.delete();

                switch (command) {
                    case 'add':
                        if (args.length === 0 || args.length < 4) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\nadd <pkg>\n    < official (o) | trust (t) | unknown (u) >\n    <repository>\n    <description>') });
                            return;
                        }

                        const name = args[1];
                        const description = args.slice(4).join(' ');
                        const githubUrl = args[3];
                        let trustLevel;
                        switch (args[2].toLowerCase()) {
                            case 'official':
                            case 'o':
                                trustLevel = TrustLevel.Official;
                                break;
                            case 'trust':
                            case 't':
                                trustLevel = TrustLevel.Trust;
                                break;
                            case 'unknown':
                            case 'u':
                                trustLevel = TrustLevel.Unknown;
                                break;
                            default:
                                trustLevel = TrustLevel.Unknown;
                        }

                        try {
                            await LibraryManagerInstance.registerAndDownload({
                                name,
                                description,
                                trustLevel,
                                allowedVersions: trustLevel === TrustLevel.Unknown ? [] : undefined,
                                githubUrl
                            });
                        } catch (error) {
                            message.edit({ content: this.addContent(args, `Error al registrar el repositorio:\n    ${(error as Error).message}`) });
                            return;
                        }

                        message.edit({ content: this.addContent(args, `Repositorio '${name}' registrado exitosamente con nivel de confianza '${TrustLevel[trustLevel]}'.`) });
                        return;
                    case 'list':
                    case 'lst':
                        const repos = LibraryManagerInstance.repos;
                        const repoList = Object.values(repos).filter(repo => !args[1] || repo.name === args[1] || repo.name.startsWith(args[1]) || repo.description.startsWith(args[1])).map(repo => `${repo.name} (${TrustLevel[repo.trustLevel]})\n    - ${repo.githubUrl}\n    - ${repo.description}`).join('\n');

                        message.edit({ content: this.addContent(args, repoList) });
                        return;
                    case 'delete':
                    case 'del':
                        if (args.length < 2) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\ndel <pkg>') });
                            return;
                        }

                        const repoName = args[1];
                        if (!LibraryManagerInstance.repos[repoName]) {
                            message.edit({ content: this.addContent(args, `El repositorio '${repoName}' no existe.`) });
                            return;
                        }
                        
                        LibraryManagerInstance.deleteRepository(repoName);

                        message.edit({ content: this.addContent(args, `Repositorio '${repoName}' eliminado exitosamente.`) });
                        return;
                    case 'modify':
                    case 'md':
                        if (args.length === 0 || args.length < 4) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\nmd <pkg>\n    < official (o) | trust (t) | unknown (u) | - >\n    <repository | - >\n    < description | - >') });
                            return;
                        }

                        const modifiedName = args[1];
                        const repo = LibraryManagerInstance.repos[modifiedName];
                        if (!repo) {
                            message.edit({ content: this.addContent(args, `El repositorio '${modifiedName}' no existe.`) });
                            return;
                        }

                        const modifiedDescription = args[4] === '-'? repo.description : args.slice(4).join(' ');
                        const modifiedGithubUrl = args[3] === '-'? repo.githubUrl : args[3];
                        let modifiedTrustLevel = args[2] === '-'? repo.trustLevel : undefined;
                        switch (args[2].toLowerCase()) {
                            case 'official':
                            case 'o':
                                modifiedTrustLevel = TrustLevel.Official;
                                break;
                            case 'trust':
                            case 't':
                                modifiedTrustLevel = TrustLevel.Trust;
                                break;
                            case 'unknown':
                            case 'u':
                                modifiedTrustLevel = TrustLevel.Unknown;
                                break;
                            default:
                                modifiedTrustLevel = TrustLevel.Unknown;
                        }

                        try {
                            LibraryManagerInstance.updateRepositoryMetadata({
                                name: modifiedName,
                                description: modifiedDescription,
                                trustLevel: modifiedTrustLevel,
                                allowedVersions: modifiedTrustLevel === TrustLevel.Unknown ? [] : undefined,
                                githubUrl: modifiedGithubUrl
                            });
                        } catch (error) {
                            message.edit({ content: this.addContent(args, `Error al modificar el repositorio:\n    ${(error as Error).message}`) });
                            return;
                        }

                        message.edit({ content: this.addContent(args, `Repositorio '${modifiedName}' modificado exitosamente.`) });
                        return;
                    case 'is-allowed':
                    case 'illw':
                        if (args.length < 3) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\nillw <pkg> <version>') });
                            return;
                        }

                        const checkRepoName = args[1];
                        const checkVersion = args[2];
                        const checkRepo = LibraryManagerInstance.repos[checkRepoName];

                        if (!checkRepo) {
                            message.edit({ content: this.addContent(args, `El repositorio '${checkRepoName}' no existe.`) });
                            return;
                        }

                        const isAllowed = LibraryManagerInstance.isVersionAllowed(checkRepo, checkVersion);

                        message.edit({ content: this.addContent(args, `'${checkRepoName} ${checkVersion}' ${isAllowed ? 'está' : 'NO está'} permitido.`) });
                        return;
                    case 'allow-with-download':
                    case 'llw':
                        if (args.length < 3) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\nllw <pkg> <version>') });
                            return;
                        }

                        const allowRepoName = args[1];
                        const allowVersion = args[2];
                        const allowRepo = LibraryManagerInstance.repos[allowRepoName];

                        if (!allowRepo) {
                            message.edit({ content: this.addContent(args, `El repositorio '${allowRepoName}' no existe.`) });
                            return;
                        }

                        if (allowRepo.trustLevel != TrustLevel.Unknown) {
                            message.edit({ content: this.addContent(args, `El repositorio '${allowRepoName}' deber ser de confianza desconocida.`) });
                            return;
                        }

                        try {
                            await LibraryManagerInstance.allowAndDownloadVersion(allowRepoName, allowVersion);
                        } catch (error) {
                            message.edit({ content: this.addContent(args, `Error al permitir y descargar la versión '${allowVersion}' del repositorio '${allowRepoName}':\n    ${(error as Error).message}`) });
                            return;
                        }

                        message.edit({ content: this.addContent(args, `Versión '${allowVersion}' del repositorio '${allowRepoName}' permitida y descargada exitosamente.`) });
                        return;
                    case 'get-version':
                    case 'gv':
                        if (args.length < 2) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\ngv <pkg>') });
                            return;
                        }

                        const versionRepoName = args[1];
                        const versionRepo = LibraryManagerInstance.repos[versionRepoName];
                        if (!versionRepo) {
                            message.edit({ content: this.addContent(args, `El repositorio '${versionRepoName}' no existe.`) });
                            return;
                        }

                        const localVersion = await LibraryManagerInstance.getVersion(versionRepoName);

                        if (!localVersion) {
                            message.edit({ content: this.addContent(args, `No hay una versión descargada para el repositorio '${versionRepoName}'.`) });
                            return;
                        }

                        message.edit({ content: this.addContent(args, `'${versionRepoName} ${localVersion}' (latest)`) });
                        return;
                    case 'clear':
                    case 'cls':
                        this.content.splice(2, this.content.length - 2);
                        message.edit({ content: this.getContent() });
                        return;
                    case 'stop':
                    case 'stp':
                        stop();
                        return;
                }

                message.edit({ content: this.addContent(args, 'Comando no encontrado.') });
                return;
            },
            onStop: () => {
                message.edit({ content: this.addContent(['stp'], 'Sesión detenida.', false) });
            }
        });
    }
}