import { Declare, Options, Command, type CommandContext, IgnoreCommand, createBooleanOption } from 'seyfert';
import Version from '../utils/version-instance';

const options = {
    update: createBooleanOption({
        description: 'Actualizar versiones',
        required: false
    })
} as const;

@Declare({
    name: "versions",
    description: "Obtén las versiones 'latest' de las releases o actualizalas",
    ignore: IgnoreCommand.Slash
})

@Options(options)

export default class PingCommand extends Command {
    async run(ctx: CommandContext<typeof options>) {
        if (ctx.options.update) new Version();

        ctx.write({ content: `# Versiones (latest)\nServidor: \`${Version.server}\`\nCompilador: \`${Version.compiler}\`\nCLI: \`${Version.cli}\`\nIDE: \`${Version.ide}\`` });
    }
}