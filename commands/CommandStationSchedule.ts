import { CommandDescriptor } from "../CommandDescriptor";
import { CommandInteraction } from "discord.js";
import { CTSService, LaneVisitsSchedule } from "../CTSService";
import { emojiForStation } from "../station_emojis";
import { BotServices } from "../BotServices";

export default class CommandStationSchedule implements CommandDescriptor {
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
        services.stats.increment(
            `COMMAND(horaires,station) ${stationParameter}`,
            interaction.user.id
        );

        if (stationParameter === null) {
            throw new Error("No station was provided");
        }

        let result = await services.cts.getStopCodes(stationParameter);

        if (result === undefined) {
            throw new Error(`Station ${stationParameter} not found`);
        }

        let userReadableName = result.userReadableName;
        let stopCodes = result.stopCodes;

        await interaction.editReply(
            await services.cts.getFormattedSchedule(userReadableName, stopCodes)
        );
    }

    handleError? = async (
        error: unknown,
        services: BotServices
    ): Promise<string> => {
        console.error(error);
        let anyError: any = error;
        if (
            anyError.isAxiosError ||
            anyError.message === "CTS_PARSING_ERROR" ||
            anyError.message === "CTS_TIME_ERROR"
        ) {
            let message = "Les horaires sont indisponibles pour le moment.";
            return message;
        } else {
            throw error;
        }
    };
}
