import { Middlewares, Declare, Options, Command, type CommandContext, IgnoreCommand, createStringOption } from 'seyfert';
import TrustUsersService from '../utils/libraries/TrustUsersService';
import { TrustUserRole } from '../utils/libraries/types';
import { findTrustHandler } from '../utils/trust/handlers';
import { openTrustPanel } from '../utils/trust/panel';
import { openTerminal } from '../utils/panels/terminal';

const options = {
    mode: createStringOption({
        description: 'Usa "text" para la terminal clásica de comandos',
        required: false,
        choices: [ { name: 'text', value: 'text' } ] as const
    })
} as const;

const adminHeader = [
    '# Introduzca comandos para la gestión de usuarios y sus paquetes',
    'stp (stop) | cls (clear) | addusr (add-user) | lstusr (list-users) [user] | delusr (delete-user) | gusr (get-user-role)\nllr (allow-repo) | addv (add-version)'
];

const contributorHeader = [
    '# Introduzca comandos para la gestión de sus paquetes',
    'stp (stop) | cls (clear) | lstusr (list-users) [user] | gusr (get-user-role)\naddv (add-version)'
];

@Declare({
    name: "trust",
    description: "Gestiona los paquetes y usuarios permitidos del servidor",
    ignore: IgnoreCommand.Slash
})

@Options(options)

@Middlewares([ 'trustuser' ])

export default class TrustCommand extends Command {
    async run (ctx: CommandContext<typeof options>) {
        if (ctx.options.mode === 'text') return this.runTerminal(ctx);

        return openTrustPanel(ctx);
    }

    /** the classic terminal-style interface, kept as an escape route behind `.trust text`. */
    private async runTerminal (ctx: CommandContext<typeof options>) {
        const actorId = ctx.author.id;
        const isAdmin = () => TrustUsersService.getUser(actorId)?.role === TrustUserRole.Admin;

        return openTerminal(ctx, isAdmin() ? adminHeader : contributorHeader, (command) => {
            const handler = findTrustHandler(command);
            if (!handler) return undefined;

            if (handler.adminOnly && !isAdmin()) return 'No tienes permiso para acceder a este comando.';

            return { minArgs: handler.minArgs, usage: handler.usage, run: (args) => handler.run(args, actorId) };
        });
    }
}
