import { Middlewares, Declare, Options, Command, type CommandContext, IgnoreCommand, createStringOption } from 'seyfert';
import { findPkgHandler } from '../utils/pkg/handlers';
import { openPkgPanel } from '../utils/pkg/panel';
import { openTerminal } from '../utils/panels/terminal';

const options = {
    mode: createStringOption({
        description: 'Usa "text" para la terminal clásica de comandos',
        required: false,
        choices: [ { name: 'text', value: 'text' } ] as const
    })
} as const;

const terminalHeader = [
    '# Introduzca comandos para la gestión de paquetes',
    'stp (stop) | cls (clear) | add | lst (list) [pkg] | del (delete) | md (modify) | illw (is-allowed)\nllw (allow-with-download) | gv (get-version) | sg (sign) | up (update)'
];

@Declare({
    name: "pkg",
    description: "Gestiona los paquetes del servidor",
    ignore: IgnoreCommand.Slash
})

@Options(options)

@Middlewares([ 'staff' ])

export default class PackageCommand extends Command {
    async run(ctx: CommandContext<typeof options>) {
        // the classic terminal-style interface, kept as an escape route behind `.pkg text`.
        if (ctx.options.mode === 'text') return openTerminal(ctx, terminalHeader, findPkgHandler);

        return openPkgPanel(ctx);
    }
}
