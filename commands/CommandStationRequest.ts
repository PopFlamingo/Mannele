import { CommandDescriptor } from "../CommandDescriptor.js";
import {
    ChatInputCommandInteraction,
    CacheType,
    Message,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    ButtonBuilder,
    ButtonStyle,
    MessageActionRowComponentBuilder,
    ButtonInteraction,
    BaseMessageOptions,
} from "discord.js";
import { BotServices } from "../BotServices.js";
import { NameNotFoundError, PathBasedRetrievalError, PathBasedRetrievalErrorType } from "../CTSService.js";
import { fullCommandName } from "../utilities.js";


class PostStationResolveError extends Error {
    constructor(warpedError: unknown, stationPath: string) {
        if (warpedError instanceof Error) {
            super(warpedError.message);
            this.name = "PostStationResolveError";
            this.stack = warpedError.stack;
            this.warpedError = warpedError;
            this.stationPath = stationPath;
        } else {
            super(`${warpedError}`);
            this.name = "PostStationResolveError";
            this.warpedError = warpedError;
            this.stationPath = stationPath;
        }
    }

    stationPath: string;
    warpedError: unknown;
}

async function warpErrors<T>(stationPath: string, closure: () => T | Promise<T>): Promise<T> {
    try {
        return await Promise.resolve(closure());
    } catch (error) {
        throw new PostStationResolveError(error, stationPath);
    }
}

export default class CommandStationRequest implements CommandDescriptor {
    commandName: string = "horaires";
    subCommandName: string | null = null;

    async execute(
        interaction: ChatInputCommandInteraction<CacheType>,
        services: BotServices
    ): Promise<void> {
        let stationName = interaction.options.getString("station");
        // Save some stats
        services.stats.increment(
            "COMMAND(horaires/command)",
            interaction.user.id
        );

        if (stationName === null || stationName === "") {
            throw new Error("No station was provided");
        }

        const flattenedMatches = await services.cts.searchFlattenedStation(stationName);

        if (flattenedMatches.length < 1) {
            throw new Error("STATION_NOT_FOUND");
        } else if (
            flattenedMatches.length === 1 &&
            flattenedMatches[0].isExactMatch
        ) {
            let stationRedableName = flattenedMatches[0].stationName;
            let stopCodes = flattenedMatches[0].logicStations.map((station) => {
                return station.logicStopCode;
            });
            let path = flattenedMatches[0].path

            await interaction.editReply({
                content: await warpErrors(
                    path,
                    async () => await services.cts.getFormattedSchedule(
                        stationRedableName,
                        stopCodes,
                        interaction.locale.toString()
                    )
                ),
                components: CommandStationRequest.makeMessageComponents(path),
            });
        } else {
            let options = flattenedMatches.map(match => {
                let name = match.stationName;
                if (match.geoDescription !== undefined) {
                    name += ` (${match.geoDescription})`;
                }
                return { label: name, value: match.path };
            });

            const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("station_choice")
                    .setPlaceholder("Choix de la station")
                    .addOptions(options)
            );

            let message = "";
            if (options.length > 1) {
                message =
                    "Plusieurs stations peuvent correspondre à votre requête,";
                message += " merci d'en choisir une dans le menu ci-dessous.";
            } else {
                message = "J'ai trouvé une station qui pourrait correspondre ";
                message += "à votre requête mais je n'en suis pas tout à fait ";
                message += "sûr...";
            }

            let maybeMessage = await interaction.editReply({
                content: message,
                components: [menuRow],
            });

            let reply: Message | undefined;

            if (interaction.guildId === null) {
                let user = await interaction.client.users.fetch(
                    interaction.user.id
                );

                let channel = (await user.dmChannel) || (await user.createDM());
                let lastMessages = await channel.messages.fetch({
                    limit: 1,
                });

                reply = lastMessages?.first();
            } else {
                if (!(maybeMessage instanceof Message)) {
                    throw new Error("Reply is not a Message");
                }
                reply = maybeMessage;
            }

            if (reply === undefined) {
                throw new Error("Reply is undefined");
            }

            const collector = reply.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 600000,
            });

            collector.on("collect", async (componentInteraction) => {
                // Guard against interaction from other users
                if (componentInteraction.user.id !== interaction.user.id) {
                    let message = "Seule la personne à l'origine de ";
                    message += "la commande peut utiliser ce menu. ";
                    message += "Merci de m'envoyer une autre requête ";
                    message += "si vous souhaitez obtenir des informations.";
                    await componentInteraction.reply({
                        ephemeral: true,
                        content: message,
                    });
                    return;
                }

                try {
                    await componentInteraction.deferUpdate();
                    if (!componentInteraction.isStringSelectMenu()) {
                        throw new Error("COMPONENT_NOT_SELECT_MENU");
                    }

                    let { name: readableName, value: station, locationDescription: locationDescription } =
                        services.cts.getExtendedStationFromPath(componentInteraction.values[0]);
                    // Throw an error if the station was not found
                    if (station === undefined) {
                        throw new Error("STATION_NOT_FOUND");
                    }

                    if (locationDescription !== undefined) {
                        readableName += ` (${locationDescription})`;
                    }

                    let logicStopCodes = station.logicStations.map((station) => {
                        return station.logicStopCode;
                    });

                    await componentInteraction.editReply({
                        content: await warpErrors(
                            componentInteraction.values[0],
                            async () => await services.cts.getFormattedSchedule(
                                readableName,
                                logicStopCodes,
                                interaction.locale.toString()
                            )
                        ),
                        components: CommandStationRequest.makeMessageComponents(componentInteraction.values[0]),
                    });
                } catch (error) {
                    if (this.handleError !== undefined) {
                        try {
                            let errorMessage = await this.handleError(
                                error,
                                services
                            );
                            if (typeof errorMessage === "string") {
                                await componentInteraction.editReply({
                                    content: errorMessage,
                                    components: [],
                                });
                            } else {
                                await componentInteraction.editReply(
                                    errorMessage
                                );
                            }
                        } catch (error) {
                            await componentInteraction.editReply({
                                content: "Erreur inconnue",
                                components: [],
                            });
                        }
                    } else {
                        await componentInteraction.editReply({
                            content: "Erreur inconnue",
                            components: [],
                        });
                    }
                }
            });

            collector.on("end", async (collected) => {
                const maybeMatch = collected.find(
                    (c) => c.user.id === interaction.user.id
                );
                // If the user didn't select anything, we remove the message
                // so that it doesn't stay present forever while not being usable
                // anymore.
                if (maybeMatch === undefined) {
                    await interaction.deleteReply();
                }
            });
        }
    }

    static makeMessageComponents(id: string): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
        if (id.length > 100) {
            // Very unlikely to happen as it would require CTS to make an extremely long station name
            // and/or a station with lengthy ids some way or another
            console.error(`[CommandStationRequest] Station path ("${id}") is too long (${id.length} > 100)`);
            return [];
        }
        const optionsDate: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };

        const optionsTime: Intl.DateTimeFormatOptions = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };

        const dateInParis = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...optionsDate });
        const timeInParis = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...optionsTime });

        const formattedDate = `Le ${dateInParis} à ${timeInParis}`;

        const refreshButton = new ButtonBuilder()
            .setCustomId(id)
            .setLabel(formattedDate)
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary);

        return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            refreshButton
        )];
    }

    handleButton?= async (
        interaction: ButtonInteraction<CacheType>,
        services: BotServices
    ): Promise<void> => {
        services.stats.increment(
            "COMMAND(horaires/button)",
            interaction.user.id
        );
        const path = interaction.customId
        let { name: readableName, value: station, locationDescription: locationDescription } =
            services.cts.getExtendedStationFromPath(path);

        if (locationDescription !== undefined) {
            readableName += ` (${locationDescription})`;
        }

        let logicStopCodes = station.logicStations.map((station) => {
            return station.logicStopCode;
        });

        await interaction.editReply({
            content: await warpErrors(
                path,
                async () => await services.cts.getFormattedSchedule(
                    readableName,
                    logicStopCodes,
                    interaction.locale.toString()
                )
            ),
            components: CommandStationRequest.makeMessageComponents(path),
        });
    };

    handleError?= async (
        error: unknown,
        services: BotServices
    ): Promise<string | BaseMessageOptions> => {
        return this.handleErrors(error, services);
    };

    handleButtonError?= async (
        error: unknown,
        services: BotServices
    ): Promise<string | BaseMessageOptions> => {
        return this.handleErrors(error, services);
    }

    async handleErrors(error: unknown, services: BotServices): Promise<string | BaseMessageOptions> {
        let stationPath: string | undefined = undefined
        if (error instanceof PostStationResolveError) {
            stationPath = error.stationPath
            error = error.warpedError
        }
        let anyError = error as any;
        if (error instanceof PathBasedRetrievalError) {
            return this.handlePathBasedRetrievalError(error);
        } else if (
            anyError.isAxiosError ||
            anyError.message === "CTS_PARSING_ERROR" ||
            anyError.message === "CTS_TIME_ERROR"
        ) {
            let text = "Les horaires sont indisponibles, cela signifie ";
            text += "*peut être* qu'il n'y a pas de passages de bus ou trams ";
            text += "pour le moment, ou alors simplement que les serveurs de la CTS ont un problème.";
            text += `\n${services.cts.getLocalizedAccuracyWarnings(null)}`;
            // TODO: Dynamically localize this message (try to see if others need to be dyn. localized too)
            // This means we need to get the locale from the interaction, requiring modifying the CommandDescriptor interface
            return {
                content: text,
                components: stationPath === undefined ? [] : CommandStationRequest.makeMessageComponents(stationPath)
            };
        } else if (error instanceof Error && error.message === "STATION_NOT_FOUND") {
            let text = "La station demandée ne semble pas exister. ";
            text += "Vérifiez que vous n'ayez pas fait d'erreur dans le nom.";
            text +=
                "\nMa base de données des noms et références de stations a été ";
            text += "mise à jour la dernière fois le ";
            text += process.env.LAST_STOP_UPDATE || "[inconnu]";
            text +=
                ".\n\n*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0))*";

            return text;
        } else {
            if (stationPath) {
                let errorMessage = "Une erreur est survenue ! :slight_frown:\n";
                errorMessage +=
                    "Cela peut être une erreur interne ou provenir d'un service que j'ai tenté de contacter.\n";
                errorMessage += `Si le problème persiste, tentez d'utiliser à nouveau directement la commande `;
                errorMessage += `\`/${fullCommandName(this)}\` pour obtenir les `;
                errorMessage += "horaires de la station de votre choix, plutôt que le bouton de réactualisation.\n";
                return {
                    content: errorMessage,
                    components: CommandStationRequest.makeMessageComponents(stationPath)
                }
            } else {
                throw error;
            }
        }
    }

    handlePathBasedRetrievalError(error: PathBasedRetrievalError): string {
        if (error instanceof NameNotFoundError) {
            if (error.hint !== null) {
                let message = "⚠️  Erreur : Je ne trouve pas de station portant ce nom exact\n"
                message += `La station "${error.hint}" pourrait correspondre à votre requête mais `
                message += "je n'en suis pas certain.\n"
                message += `Vous pouvez tenter d'utiliser à nouveau la commande \`/${fullCommandName(this)}\` `
                message += "pour obtenir les horaires de la station de votre choix. Merci de votre compréhension."
                return message;
            } else {
                let message = "⚠️  Erreur : Je ne trouve pas de station portant ce nom exact\n"
                message += "Le nom de votre station peut être été changé dans la base de données de la CTS, ou alors elle n'existe plus.\n"
                message += `Vous pouvez tenter d'utiliser à nouveau la commande \`/${fullCommandName(this)}\` `
                message += "pour obtenir les horaires de la station de votre choix. Merci de votre compréhension."
                return message;
            }
        } else {
            if (error.type === PathBasedRetrievalErrorType.INVALID_PATH_FORMAT) {
                let message = "⚠️  Erreur innatendue.\n"
                message += `Vous pouvez tenter d'utiliser à nouveau la commande \`/${fullCommandName(this)}\` pour obtenir les horaires.`
                return message
            } else if (error.type === PathBasedRetrievalErrorType.NO_MATCHING_IDS) {
                let message = "⚠️  Erreur : Évolution des données\n"
                message += "Un changement interne de Mannele ou aux données de la CTS nécessite que "
                message += `vous utilisiez à nouveau la commande \`/${fullCommandName(this)}\` `
                message += "pour accéder aux informations liées à votre station. Merci de votre compréhension.\n"
                return message;
            } else {
                let message = "⚠️  Erreur inconnue\n"
                message += "Vous pouvez tenter d'utiliser à nouveau la commande "
                message += `\`/${fullCommandName(this)}\`pour tenter d'obtenir des horaires.`
                return message;
            }
        }
    }
}
