import { createMiddleware } from "seyfert";
import { MessageFlags } from 'seyfert/lib/types';

export const staffMiddleware = createMiddleware<void>((middle: any) => {
    console.log(`${middle.context.author.username} (${middle.context.author.id}) ran ${middle.context.resolver.fullCommandName}`);

    if (middle.context.member._roles.includes('1031233001297821766')) middle.next();
    else middle.context.write({
        content: `Debes ser CEO para usar este comando. La ejecución de este comando ha sido registrada temporalmente.`,
        flags: MessageFlags.Ephemeral
    });
});