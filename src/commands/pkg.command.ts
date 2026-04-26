import { Middlewares, Declare, Command, type CommandContext, IgnoreCommand } from 'seyfert';
import { LibraryManagerInstance, TrustLevel } from 'src/utils/LibraryManager';

@Declare({
    name: "pkg",
    description: "Gestiona los paquetes del servidor",
    ignore: IgnoreCommand.Slash
})

@Middlewares([ 'staff' ])

export default class PingCommand extends Command {
    private content: string[] = ['# Introduzca comandos para la gestión de paquetes', 'stp (stop) | add | lst (list) | del (delete)'];

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
                        const repoList = Object.values(repos).map(repo => `${repo.name} (${TrustLevel[repo.trustLevel]})\n    - ${repo.githubUrl}\n    - ${repo.description}`).join('\n');

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