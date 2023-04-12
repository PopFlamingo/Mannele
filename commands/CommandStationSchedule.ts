import { CommandDescriptor } from "../CommandDescriptor.js";
import { ChatInputCommandInteraction, CacheType } from "discord.js";
import { BotServices } from "../BotServices.js";

export default class CommandStationSchedule implements CommandDescriptor {
    commandName: string = "horaires";
    subCommandName: string = "u";

    async execute(
        interaction: ChatInputCommandInteraction<CacheType>,
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
        let stopCode =
            result.extendedStations[0].logicStations[0].logicStopCode;

        await interaction.editReply(
            await services.cts.getFormattedSchedule(userReadableName, [
                stopCode,
            ])
        );
    }

    handleError?= async (
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
            text += "*peut être* qu'il n'y a pas de passages de bus ou trams ";
            text += "pour le moment, ou alors simplement que les serveurs de la CTS ont un problème.";
            text +=
                "\n\n*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0))*";

            return text;
        } else {
            throw error;
        }
    };
}
