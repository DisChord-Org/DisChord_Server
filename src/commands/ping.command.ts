import { Declare, Command, type CommandContext, IgnoreCommand } from 'seyfert';

@Declare({
    name: "ping",
    description: "Obtén la velocidad del bot",
    ignore: IgnoreCommand.Slash
})

export default class PingCommand extends Command {
    async run(ctx: CommandContext) {
        const wsPing = Math.floor(ctx.client.gateway.latency);
        const clientPing = Math.floor(Date.now() - (ctx.message ?? ctx.interaction)!.createdTimestamp);
        const shardPing = Math.floor((await ctx.client.gateway.get(ctx.shardId)?.ping()) ?? 0);

        ctx.write({ content: `API: \`${wsPing}ms\`\nMessages: \`${clientPing}ms\`\nShard: \`${shardPing}ms\`` });
    }
}