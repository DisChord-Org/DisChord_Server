import type { ModalSubmitInteraction } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/index.js';

import { UserError } from '../errors';

/** How long a panel keeps answering before its buttons are disabled. */
export const PanelTimeoutMs = 10 * 60 * 1000;
/** How long Discord waits for a modal to be submitted. */
export const ModalWaitMs = 5 * 60 * 1000;

/** What the user sees when something fails that they cannot fix; the detail stays in the server log. */
export const UnexpectedErrorText = 'Error inesperado. Revisa los logs del servidor.';

/** Runs an action and turns its outcome into the text the user sees; unexpected errors are logged, not leaked. */
export async function attempt(action: () => Promise<string> | string): Promise<string> {
    try {
        return `✅ ${await action()}`;
    } catch (error) {
        if (error instanceof UserError) return `⚠️ ${error.message}`;

        console.error('Error inesperado en un panel:', error);
        return `⚠️ ${UnexpectedErrorText}`;
    }
}

/** The text a modal field holds, trimmed; for select fields, the first chosen value. */
export function textValue(submit: ModalSubmitInteraction, id: string): string {
    const value = submit.getInputValue(id);
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/** Sends a private answer to a modal submit; long actions are acknowledged first (Discord gives 3 seconds). */
export async function answerModal(submit: ModalSubmitInteraction, action: () => Promise<string> | string): Promise<void> {
    await submit.deferReply(MessageFlags.Ephemeral);
    await submit.editOrReply({ content: await attempt(action) });
}
