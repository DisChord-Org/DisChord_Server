import { ActionRow, Button, Embed, Label, Modal, StringSelectMenu, StringSelectOption, TextInput } from 'seyfert';
import { ButtonStyle, TextInputStyle } from 'seyfert/lib/types/index.js';

import { RepositoryData, TrustUser, TrustUserRole } from '../libraries/types';
import type { SelectorView } from '../pagination';
import { MaxSelectOptions, localVersions } from '../pkg/views';
import { roleLabel } from './actions';

/** Custom ids of the trust panels' buttons and modals. */
export enum TrustId {
    AddUser = 'trust:add-user',
    AllowRepo = 'trust:allow-repo',
    Register = 'trust:register',
    DeleteUser = 'trust:delete-user',
    DeleteConfirm = 'trust:delete-user:confirm',
    DeleteCancel = 'trust:delete-user:cancel'
}

/** Field ids inside the modals. */
export enum TrustField {
    UserId = 'userId',
    Role = 'role',
    Repo = 'repo'
}

const dateOf = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

/** Admin panel: the page of users (selected one marked) followed by the selected user's details. */
export function formatUsers(items: readonly TrustUser[], view: SelectorView): string {
    const lines = items.map((user, i) => `${view.firstIndex + i === view.selectedIndex ? '▸' : '•'} \`${user.id}\` · ${roleLabel(user.role)} · ${user.allowedRepos.length} paquete${user.allowedRepos.length === 1 ? '' : 's'}`);
    const selected = items[view.selectedIndex - view.firstIndex];

    return selected ? `${lines.join('\n')}\n\n${formatUserDetail(selected)}` : lines.join('\n');
}

export function formatUserDetail(user: TrustUser): string {
    return [
        `### <@${user.id}>`,
        `**Id:** \`${user.id}\` · **Rol:** ${roleLabel(user.role)} · **Desde:** ${user.createdAt ? dateOf(user.createdAt) : 'siempre'}`,
        `**Paquetes permitidos:** ${user.allowedRepos.length ? user.allowedRepos.map(repo => `\`${repo}\``).join(', ') : 'ninguno'}`
    ].join('\n');
}

/** Contributor panel: their packages, with the newest local version of each. */
export function formatManageable(items: readonly RepositoryData[], view: SelectorView): string {
    return items.map((repo, i) => {
        const marker = view.firstIndex + i === view.selectedIndex ? '▸' : '•';
        return `${marker} **${repo.name}** · \`${localVersions(repo.name)[0] ?? 'sin descargar'}\` · ${repo.description || '*Sin descripción*'}`;
    }).join('\n');
}

export const usersEmbed = (view: SelectorView): Embed =>
    new Embed()
        .setTitle('Usuarios de confianza')
        .setColor('Blurple')
        .setFooter({ text: `Página ${view.page}/${view.totalPages} · ${view.totalItems} usuario${view.totalItems === 1 ? '' : 's'}` });

export const manageableEmbed = (view: SelectorView): Embed =>
    new Embed()
        .setTitle('Tus paquetes')
        .setColor('Blurple')
        .setFooter({ text: `Página ${view.page}/${view.totalPages} · ${view.totalItems} paquete${view.totalItems === 1 ? '' : 's'}` });

export const adminInformation = [
    '**▲ ▼** cambian de usuario y **◀ ▶** de página.',
    '**➕ Usuario:** añade un usuario de confianza (administrador o colaborador).',
    '**📦 Permitir:** da al usuario seleccionado acceso a un paquete.',
    '**📥 Versión:** registra la última release de un paquete.',
    '**🗑️ Eliminar:** borra al usuario seleccionado (no puedes borrarte a ti ni al último administrador).',
    '',
    'Si algo falla, `.trust text` abre la terminal clásica de comandos.'
].join('\n');

export const contributorInformation = [
    '**▲ ▼** cambian de paquete y **◀ ▶** de página.',
    '**📥 Registrar versión:** descarga la última release del paquete seleccionado.',
    '',
    'Solo ves los paquetes a los que un administrador te ha dado acceso.'
].join('\n');

export const adminActions = () => [
    new Button().setCustomId(TrustId.AddUser).setEmoji('➕').setLabel('Usuario').setStyle(ButtonStyle.Success),
    new Button().setCustomId(TrustId.AllowRepo).setEmoji('📦').setLabel('Permitir').setStyle(ButtonStyle.Secondary),
    new Button().setCustomId(TrustId.Register).setEmoji('📥').setLabel('Versión').setStyle(ButtonStyle.Secondary),
    new Button().setCustomId(TrustId.DeleteUser).setEmoji('🗑️').setLabel('Eliminar').setStyle(ButtonStyle.Danger)
] as const;

export const contributorActions = () => [
    new Button().setCustomId(TrustId.Register).setEmoji('📥').setLabel('Registrar versión').setStyle(ButtonStyle.Success),
    null, null, null
] as const;

export function deleteUserConfirmation(user: TrustUser): { embeds: Embed[]; components: ActionRow<Button>[] } {
    return {
        embeds: [
            new Embed()
                .setTitle('¿Eliminar este usuario?')
                .setColor('Red')
                .setDescription(`Se revocarán todos los permisos de <@${user.id}> (\`${user.id}\`). Esta acción no se puede deshacer.`)
        ],
        components: [
            new ActionRow<Button>().addComponents(
                new Button().setCustomId(TrustId.DeleteConfirm).setEmoji('🗑️').setLabel('Eliminar').setStyle(ButtonStyle.Danger),
                new Button().setCustomId(TrustId.DeleteCancel).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

const repoSelect = (title: string, repos: readonly string[]): Label =>
    new Label().setLabel(title).setComponent(
        new StringSelectMenu().setCustomId(TrustField.Repo).setPlaceholder('Elige un paquete').setOptions(
            repos.slice(0, MaxSelectOptions).map(name => new StringSelectOption().setLabel(name).setValue(name))
        )
    );

export const addUserModal = (): Modal =>
    new Modal().setCustomId(TrustId.AddUser).setTitle('Añadir usuario de confianza').addComponents(
        new Label().setLabel('Id de Discord del usuario').setComponent(
            new TextInput().setCustomId(TrustField.UserId).setStyle(TextInputStyle.Short).setRequired(true).setLength({ min: 15, max: 25 }).setPlaceholder('760769497358794783')
        ),
        new Label().setLabel('Rol').setComponent(
            new StringSelectMenu().setCustomId(TrustField.Role).setPlaceholder('Elige un rol').setOptions([
                new StringSelectOption().setLabel('Colaborador').setValue('contrib').setDescription('Solo registra versiones de sus paquetes').setDefault(true),
                new StringSelectOption().setLabel('Administrador').setValue('adm').setDescription('Gestiona usuarios y paquetes permitidos')
            ])
        )
    );

/** @returns The modal, or `undefined` when there is no package left to allow. */
export function allowRepoModal(user: TrustUser, allRepos: readonly string[]): Modal | undefined {
    const available = allRepos.filter(name => !user.allowedRepos.includes(name));
    if (!available.length) return undefined;

    return new Modal().setCustomId(TrustId.AllowRepo).setTitle('Permitir paquete').addComponents(repoSelect('Paquete a permitir', available));
}

/** @returns The modal, or `undefined` when there are no packages registered. */
export function registerModal(allRepos: readonly string[]): Modal | undefined {
    if (!allRepos.length) return undefined;

    return new Modal().setCustomId(TrustId.Register).setTitle('Registrar última versión').addComponents(repoSelect('Paquete', allRepos));
}

export const roleFromWord = (word: string): TrustUserRole | undefined =>
    word === 'adm' ? TrustUserRole.Admin : word === 'contrib' ? TrustUserRole.Contributor : undefined;
