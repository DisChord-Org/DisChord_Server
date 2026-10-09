import { Middlewares, Declare, Options, Command, type CommandContext, IgnoreCommand, createStringOption } from 'seyfert';
import TrustUsersService from '../utils/libraries/TrustUsersService';
import { TrustUserRole } from '../utils/libraries/types';
import { findTrustHandler } from '../utils/trust/handlers';
import { UserError } from '../utils/trust/actions';
import { openTrustPanel } from '../utils/trust/panel';

const options = {
    modo: createStringOption({
        description: 'Usa "text" para la terminal clásica de comandos',
        required: false,
        choices: [ { name: 'text', value: 'text' } ] as const
    })
} as const;

@Declare({
    name: "trust",
    description: "Gestiona los paquetes y usuarios permitidos del servidor",
    ignore: IgnoreCommand.Slash
})

@Options(options)

@Middlewares([ 'trustuser' ])

export default class TrustCommand extends Command {
    private content: string[] = [];

    private addContent (args: string[], message: string, addEndIndicator: boolean = true): string {
        if (this.content.length >= 12) this.content.splice(2, 1);
        this.content.push(`> ${args.join(' ')}`, `${message}`);
        return this.getContent(addEndIndicator);
    }

    private getContent (addEndIndicator: boolean = true): string {
        const content = `\`\`\`bash\n${this.content.join('\n')}${addEndIndicator ? '\n> ' : ''}\`\`\``;
        if (content.length > 2000) return 'El contenido es demasiado largo para ser mostrado.';

        return content;
    }

    async run (ctx: CommandContext<typeof options>) {
        if (ctx.options.modo === 'text') return this.runTerminal(ctx);

        return openTrustPanel(ctx);
    }

    /** The classic terminal-style interface, kept as an escape route behind `.trust text`. */
    private async runTerminal (ctx: CommandContext<typeof options>) {
        const UserRole = TrustUsersService.getUserRole(ctx.author.id);
        if (UserRole === TrustUserRole.Admin) {
            this.content = [ '# Introduzca comandos para la gestión de usuarios y sus paquetes', 'stp (stop) | cls (clear) | addusr (add-user) | lstusr (list-users) [user] | delusr (delete-user) | gusr (get-user-role)\nllr (allow-repo) | addv (add-version)' ];
        } else {
            this.content = [ '# Introduzca comandos para la gestión de sus paquetes', 'stp (stop) | cls (clear) | lstusr (list-users) [user] | gusr (get-user-role)\naddv (add-version)' ];
        }

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

                const handler = findTrustHandler(command);
                if (handler) {
                    if (handler.adminOnly && TrustUsersService.getUser(ctx.author.id)?.role !== TrustUserRole.Admin) {
                        message.edit({ content: this.addContent(args, 'No tienes permiso para acceder a este comando.') });
                        return;
                    }

                    if (args.length < handler.minArgs) {
                        message.edit({ content: this.addContent(args, handler.usage) });
                        return;
                    }

                    try {
                        message.edit({ content: this.addContent(args, await handler.run(args, ctx.author.id)) });
                    } catch (error) {
                        if (!(error instanceof UserError)) console.error(error);
                        message.edit({ content: this.addContent(args, error instanceof UserError ? error.message : `Error inesperado:\n    ${(error as Error).message}`) });
                    }
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
