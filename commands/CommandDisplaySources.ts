import { CommandDescriptor } from "../CommandDescriptor";
import { CommandInteraction } from "discord.js";
import { BotServices } from "../BotServices";
import fs from "fs";

export default class CommandStationSchedule implements CommandDescriptor {
    commandName: string = "sources";
    subCommandName: string | null = null;

    async execute(
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void> {
        let message =
            "Application, produit ou service intégrant les informations ";
        message += "publiques d'horaires des lignes de bus et tramways ";
        message += "issues de l'API open data de la Compagnie des transports ";
        message += "Strasbourgeois (CTS).\n\n";
        message +=
            "Les informations concernant les horaires sont récupérées en ";
        message +=
            "direct depuis les serveurs de la CTS (< 30s) lors d'un appel à ";
        message += "une commande correspondante.";
        await interaction.editReply({ content: message });
    }
}
