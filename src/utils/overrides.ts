import { type AnyContext, Embed, type Message, PermissionStrings, type WebhookMessage } from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";

export async function onOptionsError(ctx: AnyContext): Promise<Message | WebhookMessage | void> {
    if (!ctx.isChat()) return;

    const command = ctx.command.toJSON();

    let usage = `s.${command.name}`;

    if (command.options && command.options.length > 0) {
        for (const opt of command.options) {
            let optionStr = opt.required ? `<-${opt.name}>` : `[-${opt.name}]`;

            const option = opt;
            if ("choices" in option) {
                if (option.choices && option.choices.length > 0) {
                    const choices = option.choices.map((c) => c.name).join(", ");
                    optionStr += ` <${choices}>`;
                }
            }

            usage += ` ${optionStr}`;
        }
    }

    const embed = new Embed()
        .setColor("Red")
        .setDescription(
            `Has usado el comando de forma incorrecta.\n\n` +
            `**Uso correcto:**\n\`${usage}\``
        )
        .setTimestamp();

    return ctx.editOrReply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
}

export async function onPermissionsFail(ctx: AnyContext, permissions: PermissionStrings): Promise<Message | WebhookMessage | void> {
    return ctx.write({ content: `Requieres permisos: **\`${permissions.join(', ')}\`**` })
}