import { CommandDescriptor } from "../CommandDescriptor";
import { CommandInteraction } from "discord.js";
import { CTSService, LaneVisitsSchedule } from "../CTSService";
import { emojiForStation } from "../station_emojis";
import { BotServices } from "../BotServices";

export default class CommandStationSchedule implements CommandDescriptor {
    commandName: string = "horaires";
    subCommandName: string = "u";

    async execute(
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> {
        let stationParameter = interaction.options.getString("station");

        // Save some stats
        services.stats.increment("COMMAND(horaires,u)", interaction.user.id);
        services.stats.increment(
            `COMMAND(horaires,u) ${stationParameter}`,
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
        let stopCodes = result.stopCode;

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
            let text = "Les horaires sont indisponibles, cela signifie ";
            text += "peut être qu'il n'y a pas de passages de bus ou trams";
            text += " pour le moment.";
            text +=
                "\n\n*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0))*";

            return text;
        } else {
            throw error;
        }
    };
}
