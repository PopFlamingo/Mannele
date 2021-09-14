import { CommandDescriptor } from "../CommandDescriptor";
import { CommandInteraction } from "discord.js";
import { BotServices } from "../BotServices";

export default class CommandStationSchedule implements CommandDescriptor {
    commandName: string = "testnewcommand";
    subCommandName: string | null = null;

    async execute(
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> {
        console.log("Called");
        try {
            await services.cts.writeInfoMessage();
        } catch (error) {
            console.log(error);
        }

        await interaction.editReply("Done!");
    }
}
