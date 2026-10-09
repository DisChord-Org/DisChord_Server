import semver from 'semver';
import { ActionRow, Button, Embed, Label, Modal, StringSelectMenu, StringSelectOption, TextInput } from 'seyfert';
import { ButtonStyle, TextInputStyle } from 'seyfert/lib/types/index.js';

import StorageService from '../libraries/StorageService';
import { RepositoryData, TrustLevel } from '../libraries/types';
import type { SelectorView } from '../pagination';

/** Custom ids of the panel's own buttons and modals. */
export enum PkgId {
    Update = 'pkg:update',
    Modify = 'pkg:modify',
    Sign = 'pkg:sign',
    More = 'pkg:more',
    Allow = 'pkg:allow',
    Add = 'pkg:add',
    Delete = 'pkg:delete',
    DeleteConfirm = 'pkg:delete:confirm',
    DeleteCancel = 'pkg:delete:cancel'
}

/** Field ids inside the modals. */
export enum PkgField {
    Name = 'name',
    GithubUrl = 'githubUrl',
    Description = 'description',
    Level = 'level',
    Version = 'version'
}

/** Discord allows at most this many options in a select menu. */
export const MaxSelectOptions = 25;

const levelInfo: Record<TrustLevel, { value: string; label: string; description: string }> = {
    [TrustLevel.Official]: { value: 'official', label: 'Official', description: 'Oficial: se firma automáticamente' },
    [TrustLevel.Trust]: { value: 'trust', label: 'Trust', description: 'De confianza: se firma con auditoría manual' },
    [TrustLevel.Unknown]: { value: 'unknown', label: 'Unknown', description: 'Desconocido: solo versiones permitidas' }
};

/** Local version tags of a package, newest first. Non-semver folders are ignored, like the API does. */
export function localVersions(name: string): string[] {
    return StorageService.getLocalVersionFolders(name).filter(tag => semver.valid(tag)).sort(semver.compare).reverse();
}

/** The registry as the panel lists it: alphabetical. */
export function sortedRepos(): RepositoryData[] {
    return Object.values(StorageService.getRepos()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Lines of the page (selected one marked) followed by the details of the selected package. */
export function formatPage(items: readonly RepositoryData[], view: SelectorView): string {
    const lines = items.map((repo, i) => {
        const marker = view.firstIndex + i === view.selectedIndex ? '▸' : '•';
        const latest = localVersions(repo.name)[0] ?? 'sin descargar';

        return `${marker} **${repo.name}** · ${TrustLevel[repo.trustLevel]} · \`${latest}\``;
    });

    const selected = items[view.selectedIndex - view.firstIndex];
    return selected ? `${lines.join('\n')}\n\n${formatDetail(selected)}` : lines.join('\n');
}

/** The details block of a package. */
export function formatDetail(repo: RepositoryData): string {
    const versions = localVersions(repo.name);
    const latest = versions[0];
    const audited = latest ? repo.versions[latest]?.isAudited ?? false : false;
    const lines = [
        `### ${repo.name}`,
        repo.description || '*Sin descripción*',
        `**Nivel:** ${TrustLevel[repo.trustLevel]} · **Repo:** [${repo.githubUrl}](https://github.com/${repo.githubUrl})`,
        `**Última local:** ${latest ? `\`${latest}\` ${audited ? '(firmada)' : '(sin firmar)'}` : 'ninguna'} · **Descargadas:** ${versions.length}`
    ];

    if (repo.trustLevel === TrustLevel.Unknown) {
        lines.push(`**Versiones permitidas:** ${repo.allowedVersions.length ? repo.allowedVersions.map(v => `\`${v}\``).join(', ') : 'ninguna'}`);
    }

    return lines.join('\n');
}

export const panelEmbed = (view: SelectorView): Embed =>
    new Embed()
        .setTitle('Paquetes del servidor')
        .setColor('Blurple')
        .setFooter({ text: `Página ${view.page}/${view.totalPages} · ${view.totalItems} paquete${view.totalItems === 1 ? '' : 's'}` });

export const panelInformation = [
    '**▲ ▼** cambian de paquete y **◀ ▶** de página.',
    '**🔄 Actualizar:** descarga la última release de GitHub.',
    '**✏️ Modificar:** cambia descripción, repositorio o nivel.',
    '**✍️ Firmar:** firma una versión descargada (Trust y Official).',
    '**🧰 Más:** permitir una versión (Unknown), añadir un paquete nuevo o eliminar el seleccionado.',
    '',
    'Si algo falla, `.pkg text` abre la terminal clásica de comandos.'
].join('\n');

export const emptyPanelText = 'No hay paquetes registrados. Usa `.pkg text` y el comando `add` para crear el primero.';

/** The four action buttons of the panel, in the slots {@link PaginationSelector} expects. */
export function panelActions() {
    return [
        new Button().setCustomId(PkgId.Update).setEmoji('🔄').setLabel('Actualizar').setStyle(ButtonStyle.Success),
        new Button().setCustomId(PkgId.Modify).setEmoji('✏️').setLabel('Modificar').setStyle(ButtonStyle.Secondary),
        new Button().setCustomId(PkgId.Sign).setEmoji('✍️').setLabel('Firmar').setStyle(ButtonStyle.Secondary),
        new Button().setCustomId(PkgId.More).setEmoji('🧰').setLabel('Más').setStyle(ButtonStyle.Secondary)
    ] as const;
}

/** The "more actions" screen shown after pressing 🧰 (the "back" button is added by the caller with the paginator's own id). */
export function moreMenu(repo: RepositoryData, backButton: Button): { embeds: Embed[]; components: ActionRow<Button>[] } {
    const isUnknown = repo.trustLevel === TrustLevel.Unknown;

    return {
        embeds: [new Embed().setTitle(`Acciones para ${repo.name}`).setColor('Blurple').setDescription(formatDetail(repo))],
        components: [
            new ActionRow<Button>().addComponents(
                new Button().setCustomId(PkgId.Allow).setEmoji('✅').setLabel('Permitir versión').setStyle(ButtonStyle.Secondary).setDisabled(!isUnknown),
                new Button().setCustomId(PkgId.Add).setEmoji('➕').setLabel('Añadir paquete').setStyle(ButtonStyle.Secondary),
                new Button().setCustomId(PkgId.Delete).setEmoji('🗑️').setLabel('Eliminar').setStyle(ButtonStyle.Danger),
                backButton
            )
        ]
    };
}

export function deleteConfirmation(repo: RepositoryData): { embeds: Embed[]; components: ActionRow<Button>[] } {
    return {
        embeds: [
            new Embed()
                .setTitle('¿Eliminar este paquete?')
                .setColor('Red')
                .setDescription(`Se borrarán **${repo.name}**, todas sus versiones descargadas y sus firmas. Esta acción no se puede deshacer.`)
        ],
        components: [
            new ActionRow<Button>().addComponents(
                new Button().setCustomId(PkgId.DeleteConfirm).setEmoji('🗑️').setLabel('Eliminar').setStyle(ButtonStyle.Danger),
                new Button().setCustomId(PkgId.DeleteCancel).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

const levelSelect = (current?: TrustLevel): Label =>
    new Label().setLabel('Nivel de confianza').setComponent(
        new StringSelectMenu().setCustomId(PkgField.Level).setPlaceholder('Elige un nivel').setOptions(
            ([ TrustLevel.Official, TrustLevel.Trust, TrustLevel.Unknown ] as const).map(level =>
                new StringSelectOption()
                    .setLabel(levelInfo[level].label)
                    .setValue(levelInfo[level].value)
                    .setDescription(levelInfo[level].description)
                    .setDefault(level === current)
            )
        )
    );

const textField = (id: PkgField, label: string, options: { value?: string; placeholder?: string; paragraph?: boolean; required?: boolean; max?: number } = {}): Label => {
    const input = new TextInput()
        .setCustomId(id)
        .setStyle(options.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(options.required ?? true)
        .setLength({ max: options.max ?? 100 });
    if (options.value) input.setValue(options.value);
    if (options.placeholder) input.setPlaceholder(options.placeholder);

    return new Label().setLabel(label).setComponent(input);
};

export const modifyModal = (repo: RepositoryData): Modal =>
    new Modal().setCustomId(PkgId.Modify).setTitle(`Modificar ${repo.name}`.slice(0, 45)).addComponents(
        textField(PkgField.Description, 'Descripción', { value: repo.description, paragraph: true, required: false, max: 300 }),
        textField(PkgField.GithubUrl, 'Repositorio (owner/repo)', { value: repo.githubUrl }),
        levelSelect(repo.trustLevel)
    );

export const addModal = (): Modal =>
    new Modal().setCustomId(PkgId.Add).setTitle('Añadir paquete').addComponents(
        textField(PkgField.Name, 'Nombre del paquete', { placeholder: 'ent' }),
        textField(PkgField.GithubUrl, 'Repositorio (owner/repo)', { placeholder: 'DisChord-Org/ent' }),
        textField(PkgField.Description, 'Descripción', { paragraph: true, required: false, max: 300 }),
        levelSelect(TrustLevel.Unknown)
    );

export const allowModal = (repo: RepositoryData): Modal =>
    new Modal().setCustomId(PkgId.Allow).setTitle(`Permitir versión de ${repo.name}`.slice(0, 45)).addComponents(
        textField(PkgField.Version, 'Versión (tag de la release)', { placeholder: 'v1.0.0', max: 50 })
    );

/** @returns The sign modal, or `undefined` when the package has no downloaded versions to sign. */
export function signModal(repo: RepositoryData): Modal | undefined {
    const versions = localVersions(repo.name).slice(0, MaxSelectOptions);
    if (!versions.length) return undefined;

    return new Modal().setCustomId(PkgId.Sign).setTitle(`Firmar ${repo.name}`.slice(0, 45)).addComponents(
        new Label().setLabel('Versión a firmar').setComponent(
            new StringSelectMenu().setCustomId(PkgField.Version).setPlaceholder('Elige una versión').setOptions(
                versions.map((tag, i) => new StringSelectOption().setLabel(tag).setValue(tag).setDefault(i === 0))
            )
        )
    );
}
