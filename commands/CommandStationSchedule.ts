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
}
