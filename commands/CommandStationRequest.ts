import { CommandDescriptor } from "../CommandDescriptor";
import { CommandInteraction } from "discord.js";
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

        if (matches.length < 1) {
            throw new Error("STATION_NOT_FOUND");
        } else if (matches.length === 1) {
            
        } else {

        }

        await interaction.editReply(
            await services.cts.getFormattedScheduleForStation(stationParameter)
        );
    }

    handleError? = async (
        error: unknown,
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> => {
        if (error instanceof Error) {
            if (error.message === "STATION_NOT_FOUND") {
                let text = "La station demandée n'existe pas. ";
                text +=
                    "Vérifiez que vous n'avez pas fait d'erreur dans le nom ";
                text +=
                    "car je ne sais pas très bien les corriger pour le moment.";
                await interaction.editReply(text);
                return;
            }
        }
        throw error;
    };
}
