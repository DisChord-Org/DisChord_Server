import { Button, type CommandContext, type ComponentInteraction } from 'seyfert';
import { ButtonStyle, MessageFlags } from 'seyfert/lib/types/index.js';

import { PaginationButtonId, PaginationSelector, PaginationTexts } from '../pagination';
import { TrustPolicy } from '../libraries/TrustPolicy';
import { RepositoryData, TrustLevel } from '../libraries/types';
import { answerModal, attempt, ModalWaitMs, PanelTimeoutMs, textValue } from '../panels/helpers';
import { addPackage, allowVersion, deletePackage, modifyPackage, signVersion, updatePackage } from './actions';
import {
    addModal, allowModal, deleteConfirmation, emptyPanelText, formatPage, modifyModal, moreMenu, panelActions,
    panelEmbed, panelInformation, PkgField, PkgId, signModal, sortedRepos
} from './views';

/**
 * Opens the package panel: a list with page and selection buttons, and the actions on the selected
 * package. Only the author of the command can use it.
 */
export async function openPkgPanel(ctx: CommandContext): Promise<void> {
    const selector = new PaginationSelector<RepositoryData>(ctx, {
        data: sortedRepos(),
        itemsPerPage: 5,
        formatter: formatPage,
        embed: panelEmbed,
        information: panelInformation,
        emptyText: emptyPanelText,
        actions: [ ...panelActions() ],
        timeoutMs: PanelTimeoutMs
    });
    selector.refreshData(sortedRepos());
    await selector.start();

    const reload = () => selector.refreshData(sortedRepos());
    const backButton = () => new Button().setCustomId(PaginationButtonId.Back).setLabel(PaginationTexts.back).setStyle(ButtonStyle.Secondary);

    selector.addAction(PkgId.Update, async (interaction: ComponentInteraction, repo) => {
        if (!repo) return;

        await interaction.deferUpdate();
        const text = await attempt(() => updatePackage(repo.name));
        reload();
        await interaction.followup({ content: text, flags: MessageFlags.Ephemeral });
    });

    selector.addAction(PkgId.Modify, async (interaction, repo) => {
        if (!repo) return;

        const submit = await interaction.modal(modifyModal(repo), { waitFor: ModalWaitMs });
        if (!submit) return;

        await answerModal(submit, () => modifyPackage(repo.name, {
            description: textValue(submit, PkgField.Description),
            githubUrl: textValue(submit, PkgField.GithubUrl),
            trustLevel: TrustPolicy.parseLevel(textValue(submit, PkgField.Level))
        }));
        reload();
    });

    selector.addAction(PkgId.Sign, async (interaction, repo) => {
        if (!repo) return;

        const modal = signModal(repo);
        if (!modal) {
            await interaction.write({ content: `⚠️ El repositorio '${repo.name}' no tiene versiones descargadas.`, flags: MessageFlags.Ephemeral });
            return;
        }

        const submit = await interaction.modal(modal, { waitFor: ModalWaitMs });
        if (!submit) return;

        await answerModal(submit, () => signVersion(repo.name, textValue(submit, PkgField.Version)));
        reload();
    });

    // The "more" screen and the confirmation replace the list, so the selector must not redraw after them.
    selector.addRawAction(PkgId.More, async (interaction, repo) => {
        if (!repo) return void (await interaction.deferUpdate());

        await interaction.update(moreMenu(repo, backButton()));
    });

    selector.addRawAction(PkgId.Allow, async (interaction, repo) => {
        if (!repo) return void (await interaction.deferUpdate());

        const submit = await interaction.modal(allowModal(repo), { waitFor: ModalWaitMs });
        if (submit) {
            await answerModal(submit, () => allowVersion(repo.name, textValue(submit, PkgField.Version)));
            reload();
        }

        await selector.show(interaction);
    });

    selector.addRawAction(PkgId.Add, async (interaction) => {
        const submit = await interaction.modal(addModal(), { waitFor: ModalWaitMs });
        if (submit) {
            await answerModal(submit, () => addPackage({
                name: textValue(submit, PkgField.Name),
                githubUrl: textValue(submit, PkgField.GithubUrl),
                description: textValue(submit, PkgField.Description),
                trustLevel: TrustPolicy.parseLevel(textValue(submit, PkgField.Level)) ?? TrustLevel.Unknown
            }));
            reload();
        }

        await selector.show(interaction);
    });

    selector.addRawAction(PkgId.Delete, async (interaction, repo) => {
        if (!repo) return void (await interaction.deferUpdate());

        await interaction.update(deleteConfirmation(repo));
    });

    selector.addRawAction(PkgId.DeleteConfirm, async (interaction, repo) => {
        if (!repo) return void (await interaction.deferUpdate());

        await interaction.deferUpdate();
        const text = await attempt(() => deletePackage(repo.name));
        reload();
        await selector.show(interaction);
        await interaction.followup({ content: text, flags: MessageFlags.Ephemeral });
    });

    selector.addRawAction(PkgId.DeleteCancel, (interaction) => selector.show(interaction));
}
