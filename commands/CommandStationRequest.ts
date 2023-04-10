import { CommandDescriptor } from "../CommandDescriptor.js";
import {
    ChatInputCommandInteraction,
    CacheType,
    Message,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
} from "discord.js";
import { BotServices } from "../BotServices.js";
import { LogicStation } from "../CTSService.js";

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

        let searchResult = (await services.cts.searchStationNew(stationName)) || [];

        type FlattenedMatch = {
            logicStations: LogicStation[];
            stationName: string;
            geoDescription: string | undefined;
            isExactMatch: boolean;
            path: string;
        };

        // We will now flatten the array of matches, what this means is that
        // we are going to take all extended stations and put them in a single array
        let flattenedMatches: FlattenedMatch[] = [];
        for (let [resultIdx, { station: matchingStation, idx: topIdx }] of searchResult.stationsAndIndices.entries()) {
            for (let [secondIdx, extendedStation] of matchingStation.extendedStations.entries()) {
                flattenedMatches.push({
                    logicStations: extendedStation.logicStations,
                    stationName: matchingStation.userReadableName,
                    geoDescription:
                        extendedStation.distinctiveLocationDescription,
                    isExactMatch: resultIdx == 0 && searchResult.firstMatchIsHighConfidence,
                    path: `${topIdx}/${secondIdx}|${services.cts.hash}`,
                });
            }
        }

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
            await interaction.editReply(
                await services.cts.getFormattedSchedule(stationRedableName, stopCodes)
            );
        } else {
            let options = flattenedMatches.map((match, index) => {
                let name = match.stationName;
                if (match.geoDescription !== undefined) {
                    name += ` (${match.geoDescription})`;
                }
                return { label: name, value: match.path };
            });

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
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
                components: [row],
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
                        content: await services.cts.getFormattedSchedule(readableName, logicStopCodes),
                        components: [],
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
        } else if (
            anyError.isAxiosError ||
            anyError.message === "CTS_PARSING_ERROR" ||
            anyError.message === "CTS_TIME_ERROR"
        ) {
            let text = "Les horaires sont indisponibles, cela signifie ";
            text += "*peut être* qu'il n'y a pas de passages de bus ou trams ";
            text += "pour le moment.";
            text +=
                "\n\n*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0))*";

            return text;
        } else {
            throw error;
        }
    };
}
