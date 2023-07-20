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
    ModalActionRowComponentBuilder,
    MessageActionRowComponentBuilder,
    ButtonInteraction,
} from "discord.js";
import { BotServices } from "../BotServices.js";

export default class CommandStationRequest implements CommandDescriptor {
    commandName: string = "horaires";
    subCommandName: string = "station";

    async execute(
        interaction: ChatInputCommandInteraction<CacheType>,
        services: BotServices
    ): Promise<void> {
        let stationName = interaction.options.getString("station");
        // Save some stats
        services.stats.increment(
            "COMMAND(horaires,station)",
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
                content: await services.cts.getFormattedSchedule(stationRedableName, stopCodes, interaction.locale.toString()),
                components: [this.makeRefreshButtonRow(path)],

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
                        content: await services.cts.getFormattedSchedule(readableName, logicStopCodes, interaction.locale.toString()),
                        components: [this.makeRefreshButtonRow(componentInteraction.values[0])],
                    });
                } catch (error) {
                    if (this.handleError !== undefined) {
                        try {
                            let errorMessage = await this.handleError(
                                error,
                                services
                            );
                            await componentInteraction.editReply({
                                content: errorMessage,
                                components: [],
                            });
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


    makeRefreshButtonRow(id: string): ActionRowBuilder<MessageActionRowComponentBuilder> {
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

        return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            refreshButton
        );
    }

    handleButton?= async (
        interaction: ButtonInteraction<CacheType>,
        services: BotServices
    ): Promise<void> => {
        const path = interaction.customId
        let { name: readableName, value: station, locationDescription: locationDescription } =
            services.cts.getExtendedStationFromPath(path);
        if (station === undefined) {
            throw new Error("STATION_NOT_FOUND");
        }

        if (locationDescription !== undefined) {
            readableName += ` (${locationDescription})`;
        }

        let logicStopCodes = station.logicStations.map((station) => {
            return station.logicStopCode;
        });

        await interaction.editReply({
            content: await services.cts.getFormattedSchedule(readableName, logicStopCodes, interaction.locale.toString()),
            components: [this.makeRefreshButtonRow(path)],
        });
    };

    handleError?= async (
        error: unknown,
        services: BotServices
    ): Promise<string> => {
        let anyError = error as any;
        if (error instanceof Error && error.message === "STATION_NOT_FOUND") {
            let text = "La station demandée ne semble pas exister. ";
            text += "Vérifiez que vous n'ayez pas fait d'erreur dans le nom.";
            text +=
                "\nMa base de données des noms et références de stations a été ";
            text += "mise à jour la dernière fois le ";
            text += process.env.LAST_STOP_UPDATE || "[inconnu]";
            text +=
                ".\n\n*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0))*";

            return text;
        } else if (error instanceof Error && error.message === "HASH_MISMATCH") {
            let text = "La base de données des stations a été mise à jour, merci de réessayer, le problème devrait être résolu. ";
            return text;
        } else if (
            anyError.isAxiosError ||
            anyError.message === "CTS_PARSING_ERROR" ||
            anyError.message === "CTS_TIME_ERROR"
        ) {
            let text = "Les horaires sont indisponibles, cela signifie ";
            text += "*peut être* qu'il n'y a pas de passages de bus ou trams ";
            text += "pour le moment, ou alors simplement que les serveurs de la CTS ont un problème.";
            text +=
                "\n\n*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0))*";

            return text;
        } else {
            throw error;
        }
    };

    // Type is (error: unknown, services: BotServices) => Promise<string>;
    handleButtonError?= async (
        error: unknown,
        services: BotServices
    ): Promise<string> => {
        if (error instanceof Error && error.message === "INVALID_PATH_FORMAT") {
            let message = "Je ne suis pas parvenu à identifier la station liée à ce bouton. "
            message += `Merci d'utiliser à nouveau la commande \`/${this.commandName} ${this.subCommandName}\` pour obtenir les horaires.`
            return message
        } else if (error instanceof Error && error.message === "HASH_MISMATCH") {
            let text = "⚠️ La base de données des stations a été mise à jour. "
            text += `Merci d'utiliser à nouveau la commande \`/${this.commandName} ${this.subCommandName}\``
            text += " pour obtenir les horaires.\n"
            text += "Nous travaillons à des solutions pour limiter ce genre de problème à l'avenir."
            return text;
        } else {
            throw error;
        }
    }
}
