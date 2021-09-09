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
        let station = interaction.options.getString("station");

        // Save some stats
        services.stats.increment(
            "COMMAND(horaires,station)",
            interaction.user.id
        );
        services.stats.increment(
            `COMMAND(horaires,station) ${station}`,
            interaction.user.id
        );

        if (station === null) {
            throw new Error("No station was provided");
        }
        let stops = await services.cts.getVisitsForStation(station);
        let final = `__**Horaires pour la station *${station}***__`;
        let emoji = emojiForStation(station);
        if (emoji !== null) {
            final += `  ${emoji}`;
        }
        final += "\n";
        // Count the number of unique types of vehicles
        let types = new Set();
        for (let stop of stops) {
            types.add(stop.transportType);
        }
        if (types.size == 1) {
            final += "\n" + CTSService.formatStops(stops);
        } else {
            // Get only the "tram" vehicles
            let trams = stops.filter(
                (stop: LaneVisitsSchedule) => stop.transportType == "tram"
            );
            final += "\n**Trams  :tram: :**\n";
            final += CTSService.formatStops(trams);

            // Get only the "bus" vehicles
            let buses = stops.filter(
                (stop: LaneVisitsSchedule) => stop.transportType == "bus"
            );
            final += "\n\n**Bus  :bus: :**\n";
            final += CTSService.formatStops(buses);
        }

        await interaction.editReply(final);
    }

    handleError? = async (
        error: unknown,
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> => {
        console.error(error);
        let anyError: any = error;
        if (
            anyError.isAxiosError ||
            anyError.message === "CTS_PARSING_ERROR" ||
            anyError.message === "CTS_TIME_ERROR"
        ) {
            let message =
                "Les horaires de la CTS sont momentanément indisponibles.";
            await interaction.editReply(message);
        } else {
            throw error;
        }
    };
}
