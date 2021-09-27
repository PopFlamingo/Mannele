import { CommandDescriptor } from "../CommandDescriptor";
import {
    CommandInteraction,
    Message,
    MessageActionRow,
    MessageSelectMenu,
} from "discord.js";
import { BotServices } from "../BotServices";
import { LogicStation } from "../CTSService";
import { SIRILocation } from "../SIRITypes";

export default class CommandStationRequest implements CommandDescriptor {
    commandName: string = "horaires";
    subCommandName: string = "station";

    async execute(
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> {
        if (interaction.guildId === null) {
            let message =
                "Cette commande ne fonctionne pas depuis les messages privés ";
            message +=
                "actuellement. Utilisez la directement sur un serveur Discord ou ";
            message +=
                "bien vous pouvez utiliser la commande `/horaires u` ici pour une station ";
            message += "aux alentours de l'Unistra.";
            interaction.editReply("messages");
            return;
        }

        let stationParameter = interaction.options.getString("station");
        // Save some stats
        services.stats.increment(
            "COMMAND(horaires,station)",
            interaction.user.id
        );

        if (stationParameter === null || stationParameter === "") {
            throw new Error("No station was provided");
        }

        let matches = (await services.cts.searchStops(stationParameter)) || [];

        // We will now flatten the array of matches, what this means is that
        // we are going to take all extended stations and put them in a single array
        type FlattenedMatch = {
            logicStations: LogicStation[];
            stationName: string;
            geoDescription: string | undefined;
            isExactMatch: boolean;
        };

        let flattenedMatches: FlattenedMatch[] = [];
        let codesAddresses: Map<string, [string, SIRILocation, number]> =
            new Map();

        for (let match of matches) {
            for (let extendedStation of match.extendedStations) {
                flattenedMatches.push({
                    logicStations: extendedStation.logicStations,
                    stationName: match.userReadableName,
                    geoDescription:
                        extendedStation.distinctiveLocationDescription,
                    isExactMatch: match.isExactMatch,
                });

                for (let logicStation of extendedStation.logicStations) {
                    let address = logicStation.addressDescription;
                    if (address !== undefined) {
                        codesAddresses.set(logicStation.logicStopCode, [
                            address,
                            logicStation.location,
                            logicStation.maxDistance,
                        ]);
                    }
                }
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
                await services.cts.getFormattedSchedule(
                    stationRedableName,
                    stopCodes,
                    codesAddresses
                )
            );
        } else {
            let options = flattenedMatches.map((match, index) => {
                let name = match.stationName;
                if (match.geoDescription !== undefined) {
                    name += ` (${match.geoDescription})`;
                }
                return { label: name, value: `${index}` };
            });

            const row = new MessageActionRow().addComponents(
                new MessageSelectMenu()
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

            let reply = await interaction.editReply({
                content: message,
                components: [row],
            });

            if (!(reply instanceof Message)) {
                throw new Error("Reply is not a Message");
            }

            const collector = reply.createMessageComponentCollector({
                componentType: "SELECT_MENU",
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
                    if (!componentInteraction.isSelectMenu()) {
                        throw new Error("COMPONENT_NOT_SELECT_MENU");
                    }

                    let stationParameterIdx = parseInt(
                        componentInteraction.values[0]
                    );
                    let station = flattenedMatches[stationParameterIdx];

                    // Throw an error if the station was not found
                    if (station === undefined) {
                        throw new Error("STATION_NOT_FOUND");
                    }

                    let readableName = station.stationName;
                    if (station.geoDescription !== undefined) {
                        readableName += ` (${station.geoDescription})`;
                    }

                    let stopCodes = station.logicStations.map((station) => {
                        return station.logicStopCode;
                    });

                    await componentInteraction.editReply({
                        content: await services.cts.getFormattedSchedule(
                            readableName,
                            stopCodes,
                            codesAddresses
                        ),
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

    handleError? = async (
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
