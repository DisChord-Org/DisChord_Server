import type { CommandContext } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/index.js';

import { PaginationSelector } from '../pagination';
import StorageService from '../libraries/StorageService';
import TrustUsersService from '../libraries/TrustUsersService';
import { RepositoryData, TrustUser, TrustUserRole } from '../libraries/types';
import { answerModal, attempt, ModalWaitMs, PanelTimeoutMs, textValue } from '../panels/helpers';
import { actorRole, addTrustUser, allowRepoToUser, manageableRepos, registerLatestVersion, removeTrustUser, UserError } from './actions';
import {
    addUserModal, adminActions, adminInformation, allowRepoModal, contributorActions, contributorInformation,
    deleteUserConfirmation, formatManageable, formatUsers, manageableEmbed, registerModal, roleFromWord, TrustField, TrustId, usersEmbed
} from './views';

const sortedUsers = (): TrustUser[] => TrustUsersService.getUsers().sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
const repoNames = (): string[] => Object.keys(StorageService.getRepos()).sort((a, b) => a.localeCompare(b));

/**
 * Opens the trust panel that matches the author's role. The role is checked again inside every action,
 * so a button that should not exist for someone can never do anything even if it were pressed.
 */
export async function openTrustPanel(ctx: CommandContext): Promise<void> {
    let role: TrustUserRole;
    try {
        role = actorRole(ctx.author.id);
    } catch (error) {
        if (!(error instanceof UserError)) throw error;
        await ctx.write({ content: error.message });
        return;
    }

    if (role === TrustUserRole.Admin) return openAdminPanel(ctx);
    return openContributorPanel(ctx);
}

async function openAdminPanel(ctx: CommandContext): Promise<void> {
    const actor = ctx.author.id;
    const selector = new PaginationSelector<TrustUser>(ctx, {
        data: sortedUsers(),
        itemsPerPage: 5,
        formatter: formatUsers,
        embed: usersEmbed,
        information: adminInformation,
        actions: [ ...adminActions() ],
        timeoutMs: PanelTimeoutMs
    });
    selector.refreshData(sortedUsers());
    await selector.start();

    const reload = () => selector.refreshData(sortedUsers());

    // "Add user" does not depend on the selection, so it is the only one that works through a modal on its own.
    selector.addAction(TrustId.AddUser, async (interaction) => {
        const submit = await interaction.modal(addUserModal(), { waitFor: ModalWaitMs });
        if (!submit) return;

        await answerModal(submit, () => {
            const role = roleFromWord(textValue(submit, TrustField.Role));
            if (role === undefined) throw new UserError('Rol no válido.');

            return addTrustUser(actor, textValue(submit, TrustField.UserId), role);
        });
        reload();
    });

    selector.addAction(TrustId.AllowRepo, async (interaction, user) => {
        if (!user) return;

        const modal = allowRepoModal(user, repoNames());
        if (!modal) {
            await interaction.write({ content: '⚠️ No queda ningún paquete que permitir a este usuario.', flags: MessageFlags.Ephemeral });
            return;
        }

        const submit = await interaction.modal(modal, { waitFor: ModalWaitMs });
        if (!submit) return;

        await answerModal(submit, () => allowRepoToUser(actor, user.id, textValue(submit, TrustField.Repo)));
        reload();
    });

    selector.addAction(TrustId.Register, async (interaction) => {
        const modal = registerModal(repoNames());
        if (!modal) {
            await interaction.write({ content: '⚠️ No hay paquetes registrados.', flags: MessageFlags.Ephemeral });
            return;
        }

        const submit = await interaction.modal(modal, { waitFor: ModalWaitMs });
        if (!submit) return;

        await answerModal(submit, () => registerLatestVersion(actor, textValue(submit, TrustField.Repo)));
    });

    selector.addRawAction(TrustId.DeleteUser, async (interaction, user) => {
        if (!user) return void (await interaction.deferUpdate());

        await interaction.update(deleteUserConfirmation(user));
    });

    selector.addRawAction(TrustId.DeleteConfirm, async (interaction, user) => {
        if (!user) return void (await interaction.deferUpdate());

        await interaction.deferUpdate();
        const text = await attempt(() => removeTrustUser(actor, user.id));
        reload();
        await selector.show(interaction);
        await interaction.followup({ content: text, flags: MessageFlags.Ephemeral });
    });

    selector.addRawAction(TrustId.DeleteCancel, (interaction) => selector.show(interaction));
}

async function openContributorPanel(ctx: CommandContext): Promise<void> {
    const actor = ctx.author.id;
    const selector = new PaginationSelector<RepositoryData>(ctx, {
        data: manageableRepos(actor),
        itemsPerPage: 5,
        formatter: formatManageable,
        embed: manageableEmbed,
        information: contributorInformation,
        emptyText: 'Todavía no tienes paquetes asignados. Pide a un administrador que te dé acceso.',
        actions: [ ...contributorActions() ],
        timeoutMs: PanelTimeoutMs
    });
    selector.refreshData(manageableRepos(actor));
    await selector.start();

    selector.addAction(TrustId.Register, async (interaction, repo) => {
        if (!repo) return;

        await interaction.deferUpdate();
        const text = await attempt(() => registerLatestVersion(actor, repo.name));
        selector.refreshData(manageableRepos(actor));
        await interaction.followup({ content: text, flags: MessageFlags.Ephemeral });
    });
}
