import { CommandDescriptor } from "../CommandDescriptor";
import {
    CommandInteraction,
    Message,
    MessageActionRow,
    MessageSelectMenu,
} from "discord.js";
import { BotServices } from "../BotServices";

export default class CommandStationRequest implements CommandDescriptor {
    commandName: string = "horaires";
    subCommandName: string = "station";

    async execute(
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> {
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

        if (matches.length < 1) {
            throw new Error("STATION_NOT_FOUND");
        } else if (matches.length === 1 && matches[0].isExactMatch) {
            let stationRedableName = matches[0].userReadableName;
            let stopCode = matches[0].stopCode;
            await interaction.editReply(
                await services.cts.getFormattedSchedule(
                    stationRedableName,
                    stopCode
                )
            );
        } else {
            let options = matches.map((match) => {
                let name = match.userReadableName;
                return { label: name, value: name };
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

                    let stationParameter = componentInteraction.values[0];
                    // Find index of match in matches array
                    let result = matches.find(
                        (match) => match.userReadableName === stationParameter
                    );
                    // Throw an error if the station was not found
                    if (result === undefined) {
                        throw new Error("STATION_NOT_FOUND");
                    }

                    let readableName = result.userReadableName;
                    let stopCode = result.stopCode;

                    await componentInteraction.editReply({
                        content: await services.cts.getFormattedSchedule(
                            readableName,
                            stopCode
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
            text += process.env.LAST_STATIONS_UPDATE_DATE || "[inconnu]";
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
