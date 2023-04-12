import { CommandDescriptor } from "../CommandDescriptor.js";
import { ChatInputCommandInteraction, CacheType } from "discord.js";
import { BotServices } from "../BotServices.js";

export default class CommandStationSchedule implements CommandDescriptor {
    commandName: string = "sources";
    subCommandName: string | null = null;

    async execute(
        interaction: ChatInputCommandInteraction<CacheType>,
        services: BotServices
    ): Promise<void> {
        services.stats.increment("COMMAND(sources)", interaction.user.id);

        // Init from STARTUP_DATE env var
        let startupDateString = process.env.LAST_STOP_UPDATE;
        let message = "";
        message +=
            "⚠️  **Exactitude des horaires et données non garantie ([en savoir plus](<https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0>))**";
        message +=
            "\n\n⚠️  **Schedule and data accuracy not guaranteed ([see more info](<https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0>))**\n\n";
        message +=
            "Application, produit ou service intégrant les informations ";
        message += "publiques d'horaires des lignes de bus et tramways ";
        message += "issues de l'API open data de la Compagnie des transports ";
        message += "Strasbourgeois (CTS). ";
        message +=
            "Les informations concernant les noms et références des stations ";
        message += `ont été récupérées la dernière fois le : ${startupDateString}. `;
        message += "Les informations concernant les horaires sont récupérées ";
        message +=
            " depuis les serveurs de la CTS (ou depuis une mémoire cache) lors d'un appel à ";
        message += "une commande correspondante . Certaines données peuvent ";
        message += "correspondre à des horaires théoriques.\n\n";
        message +=
            "Données d'addressage [produites par Etalab](<https://adresse.data.gouv.fr/donnees-nationales>) et obtenues depuis [l'API Adresses](<https://geo.api.gouv.fr/adresse>), ";
        message +=
            "elles sont publiées sous la [Licence Ouverte](<https://www.etalab.gouv.fr/licence-ouverte-open-licence>) et ";
        message += `ont été récupérées la dernière fois le ${startupDateString}.`;

        await interaction.editReply({ content: message });
    }
}
