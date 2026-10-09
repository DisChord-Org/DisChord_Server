import { Middlewares, Declare, Options, Command, type CommandContext, IgnoreCommand, createStringOption } from 'seyfert';
import { findPkgHandler, UserError } from '../utils/pkg/handlers';
import { openPkgPanel } from '../utils/pkg/panel';

const options = {
    modo: createStringOption({
        description: 'Usa "text" para la terminal clásica de comandos',
        required: false,
        choices: [ { name: 'text', value: 'text' } ] as const
    })
} as const;

@Declare({
    name: "pkg",
    description: "Gestiona los paquetes del servidor",
    ignore: IgnoreCommand.Slash
})

@Options(options)

@Middlewares([ 'staff' ])

export default class PackageCommand extends Command {
    private content: string[] = ['# Introduzca comandos para la gestión de paquetes', 'stp (stop) | cls (clear) | add | lst (list) [pkg] | del (delete) | md (modify) | illw (is-allowed)\nllw (allow-with-download) | gv (get-version) | sg (sign) | up (update)'];

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

    async run(ctx: CommandContext<typeof options>) {
        if (ctx.options.modo === 'text') return this.runTerminal(ctx);

        return openPkgPanel(ctx);
    }

    /** The classic terminal-style interface, kept as an escape route behind `.pkg text`. */
    private async runTerminal(ctx: CommandContext<typeof options>) {
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

                const handler = findPkgHandler(command);
                if (handler) {
                    if (args.length < handler.minArgs) {
                        message.edit({ content: this.addContent(args, handler.usage) });
                        return;
                    }

                    try {
                        message.edit({ content: this.addContent(args, await handler.run(args)) });
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