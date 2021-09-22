import {
    SlashCommandBuilder,
    SlashCommandStringOption,
    SlashCommandSubcommandBuilder,
} from "@discordjs/builders";
import { stationCodes } from "./data";
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
require("dotenv").config();

// Load DISCORD_TOKEN from environment variables and throw an error if it's not set
let discordToken = process.env.DISCORD_TOKEN;
if (discordToken == null) {
    throw new Error("DISCORD_TOKEN environment variable not set");
}

// Load GUILD_ID from environment variables and throw an error if it's not set
let guildId = process.env.GUILD_ID;
if (guildId == null) {
    throw new Error("GUILD_ID environment variable not set");
}

// Load CLIENT_ID from environment variables and throw an error if it's not set
let clientId = process.env.CLIENT_ID;
if (clientId == null) {
    throw new Error("CLIENT_ID environment variable not set");
}

function makeStationTuplesArray(): [string, string][] {
    // Get all keys of the stationCodes object
    let stationCodesKeys = Object.keys(stationCodes);
    // Sort them alphabetically
    stationCodesKeys.sort();
    // Create an array of tuples
    let stationTuples: [string, string][] = [];
    for (let i = 0; i < stationCodesKeys.length; i++) {
        stationTuples.push([stationCodesKeys[i], stationCodesKeys[i]]);
    }

    return stationTuples;
}

const commands = [
    new SlashCommandBuilder()
        .setName("horaires")
        .setDescription("Horaires en direct pour la CTS")
        .addSubcommand(
            new SlashCommandSubcommandBuilder()
                .setName("station")
                .setDescription(
                    "Affiche les horaires pour n'importe quelle station (données CTS)"
                )
                .addStringOption(
                    new SlashCommandStringOption()
                        .setName("station")
                        .setDescription("Station à rechercher et afficher")
                        .setRequired(true)
                )
        )
        .addSubcommand(
            new SlashCommandSubcommandBuilder()
                .setName("u")
                .setDescription(
                    "Affiche les horaires pour une station aux alentours de l'Unistra (données CTS)"
                )
                .addStringOption(
                    new SlashCommandStringOption()
                        .setName("station")
                        .setDescription("Nom de la station")
                        .addChoices(makeStationTuplesArray())
                        .setRequired(true)
                )
        ),

    new SlashCommandBuilder()
        .setName("sources")
        .setDescription(
            "Affiche les sources des données du robot et les avertissements de fiabilité"
        ),
].map((command) => command.toJSON());

const rest = new REST({ version: "9" }).setToken(discordToken);

/*
(async () => {
    try {
        await rest.put(Routes.applicationCommands(clientId), {
            body: [],
        });

        console.log("Successfully registered global application commands.");
    } catch (error) {
        console.error(error);
    }
})();
*/

(async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: commands,
        });

        console.log("Successfully registered application commands.");
    } catch (error) {
        console.error(error);
    }
})();
