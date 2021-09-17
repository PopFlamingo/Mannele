import { CommandDescriptor } from "../CommandDescriptor";
import {
    CommandInteraction,
    Message,
    MessageActionRow,
    MessageSelectMenu,
} from "discord.js";
import { CTSService, LaneVisitsSchedule } from "../CTSService";
import { emojiForStation } from "../station_emojis";
import { BotServices } from "../BotServices";

export default class CommandStationRequest implements CommandDescriptor {
    commandName: string = "horaires";
    subCommandName: string = "requête";

    async execute(
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> {
        let stationParameter = interaction.options.getString("requête");
        // Save some stats
        services.stats.increment(
            "COMMAND(horaires,requête)",
            interaction.user.id
        );

        if (stationParameter === null || stationParameter === "") {
            throw new Error("No station was provided");
        }

        let matches =
            (await services.cts.getStopCodesMatches(stationParameter)) || [];

        console.log(matches);
        if (matches.length < 1) {
            throw new Error("STATION_NOT_FOUND");
        } else if (matches.length === 1) {
            console.log("One station found");
            let stationRedableName = matches[0][0];
            let stopCodes = matches[0][1];
            await interaction.editReply(
                await services.cts.getFormattedSchedule(
                    stationRedableName,
                    stopCodes
                )
            );
        } else {
            // Map matches to a { label: ..., value: ... } objects array
            // Where label is match[0] and value is match[1] values joined with a comma
            let options = matches.map((match) => {
                let name = match[0];
                return { label: name, value: name };
            });

            const row = new MessageActionRow().addComponents(
                new MessageSelectMenu()
                    .setCustomId("station_choice")
                    .setPlaceholder("Choisissez une station")
                    .addOptions(options)
            );

            let message = "Plusieurs stations correspondent à votre requête,";
            message += " merci d'en choisir une dans le menu ci-dessous.";

            let reply = await interaction.editReply({
                content: message,
                components: [row],
            });

            if (reply instanceof Message) {
                const collector = reply.createMessageComponentCollector({
                    componentType: "SELECT_MENU",
                    time: 6000,
                });
                collector.on("end", async (collected) => {
                    // If nobody interacted
                    const maybeMatch = collected.find(
                        (c) => c.user.id === interaction.user.id
                    );
                    if (maybeMatch === undefined) {
                        await interaction.deleteReply();
                    }
                });
                collector.on("collect", async (componentInteraction) => {
                    if (componentInteraction.user.id !== interaction.user.id) {
                        let errorMessage = "Seule la personne à l'origine de ";
                        errorMessage += "la commande peut utiliser ce menu. ";
                        errorMessage += "Merci de m'envoyer une autre requête ";
                        errorMessage +=
                            " si vous souhaitez obtenir des informations.";
                        await componentInteraction.reply({
                            ephemeral: true,
                            content: errorMessage,
                        });
                        return;
                    } else {
                        if (componentInteraction.isSelectMenu()) {
                            let stationParameter =
                                componentInteraction.values[0];

                            let result = await services.cts.getStopCodes(
                                stationParameter
                            );

                            if (result === undefined) {
                                throw new Error(
                                    `Station ${stationParameter} not found`
                                );
                            }

                            let readableName = result[0];
                            let stopCodes = result[1];
                            await componentInteraction.update({
                                content:
                                    await services.cts.getFormattedSchedule(
                                        readableName,
                                        stopCodes
                                    ),
                                components: [],
                            });
                        } else {
                            throw new Error("COMPONENT_NOT_SELECT_MENU");
                        }
                    }
                });
            } else {
                throw Error("Unexpected APIMessage");
            }
        }
    }

    handleError? = async (
        error: unknown,
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> => {
        let anyError = error as any;
        if (error instanceof Error && error.message === "STATION_NOT_FOUND") {
            let text = "La station demandée n'existe pas. ";
            text += "Vérifiez que vous n'avez pas fait d'erreur dans le nom ";
            text += "car je ne sais pas très bien les corriger pour le moment.";
            await interaction.editReply(text);
            return;
        } else if (
            anyError.isAxiosError ||
            anyError.message === "CTS_PARSING_ERROR" ||
            anyError.message === "CTS_TIME_ERROR"
        ) {
            let message = "Les horaires sont indisponibles pour le moment.";
            await interaction.editReply(message);
        } else {
            throw error;
        }
    };
}
