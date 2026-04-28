import { Middlewares, Declare, Command, type CommandContext, IgnoreCommand } from 'seyfert';
import LibraryManager from 'src/utils/libraries/LibraryManager';
import StorageService from 'src/utils/libraries/StorageService';
import { RepositoryData, TrustLevel } from 'src/utils/libraries/types';

@Declare({
    name: "trust",
    description: "Gestiona los paquetes y usuarios permitidos del servidor",
    ignore: IgnoreCommand.Slash
})

@Middlewares([ 'trustuser' ])

export default class TrustCommand extends Command {
    private content: string[] = ['# Introduzca comandos para la gestión de usuarios y sus paquetes', 'stp (stop) | cls (clear) | addusr (add-user) | lstusr (list-users) [user] | delusr (delete-user) | gusr (get-user-role)\nllr (allow-repo) | addv (add-version)'];

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