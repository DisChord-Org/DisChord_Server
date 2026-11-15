import type { CommandContext } from 'seyfert';

import { UserError } from '../errors';
import { UnexpectedErrorText } from './helpers';

/** A command of a text terminal, already bound to whoever opened it. */
export interface TerminalCommand {
    /** Minimum number of words (command included) needed to run it. */
    minArgs: number;
    usage: string;
    run(args: string[]): Promise<string> | string;
}

/** How long a terminal listens before it closes itself. */
const TerminalTimeoutMs = 60_000;
/** Lines kept on screen besides the header. */
const MaxLines = 12;

/**
 * The classic terminal-style interface shared by `.pkg text` and `.trust text`: the author's next
 * messages in the same channel are read as commands and answered by editing one message.
 * Its history lives in this call, so two people (or two sessions) never see each other's output.
 * @param ctx The command that opened the terminal.
 * @param header The two fixed lines on top: title and list of commands.
 * @param find Resolves a command word to something runnable, to a refusal text, or to `undefined` if it does not exist. Called for every message, so permissions are checked each time.
 */
export async function openTerminal(ctx: CommandContext, header: readonly string[], find: (command: string | undefined) => TerminalCommand | string | undefined): Promise<void> {
    const content: string[] = [ ...header ];

    const render = (addEndIndicator: boolean = true): string => {
        const text = `\`\`\`bash\n${content.join('\n')}${addEndIndicator ? '\n> ' : ''}\`\`\``;
        return text.length > 2000 ? 'El contenido es demasiado largo para ser mostrado.' : text;
    };

    const add = (args: string[], message: string, addEndIndicator: boolean = true): string => {
        if (content.length >= MaxLines) content.splice(header.length, 1);
        // Backticks would close the code block the terminal is drawn in.
        content.push(`> ${args.join(' ')}`.replace(/`/g, "'"), message.replace(/`/g, "'"));
        return render(addEndIndicator);
    };

    const message = await ctx.write({ content: render() }, true);
    const show = (text: string) => message.edit({ content: text }).catch(error => console.error('No se pudo actualizar la terminal:', error));

    ctx.client.collectors.create({
        event: 'MESSAGE_CREATE',
        filter: (arg) => arg.author.id === ctx.author.id && arg.channelId === ctx.channelId,
        timeout: TerminalTimeoutMs,
        run: async (arg, stop): Promise<void> => {
            const args = arg.content.trim().split(/\s+/);
            const command = args[0]?.toLowerCase();
            arg.delete().catch(() => undefined);

            switch (command) {
                case 'clear':
                case 'cls':
                    content.splice(header.length);
                    await show(render());
                    return;
                case 'stop':
                case 'stp':
                    stop();
                    return;
            }

            const found = find(command);
            if (found === undefined) return void (await show(add(args, 'Comando no encontrado.')));
            if (typeof found === 'string') return void (await show(add(args, found)));
            if (args.length < found.minArgs) return void (await show(add(args, found.usage)));

            try {
                await show(add(args, await found.run(args)));
            } catch (error) {
                if (!(error instanceof UserError)) console.error(error);
                await show(add(args, error instanceof UserError ? error.message : UnexpectedErrorText));
            }
        },
        onStop: () => {
            void show(add([ 'stp' ], 'Sesión detenida.', false));
        }
    });
}
