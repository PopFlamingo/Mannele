import { SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder } from "@discordjs/builders";
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Load DISCORD_TOKEN from environment variables and throw an error if it's not set
let tokenCTS = process.env.DISCORD_TOKEN;
if (tokenCTS == null) {
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

let stations = [
    "Esplanade",
    "Université",
    "Observatoire",
    "Palerme",
    "Rome",
    "Cité administrative"
]

let stationsTuples: [string,string][] = [
    ["Esplanade","Esplanade"],
    ["Université","Université"],
    ["Observatoire","Observatoire"],
    ["Palerme","Palerme"],
    ["Rome","Rome"],
    ["Cité administrative","Cité administrative"]
]


// Sort stations by name
stations.sort();


const commands = [
	new SlashCommandBuilder()
    .setName("horaires")
    .setDescription("Affiche les horaires pour des lignes et station aux alentours de l'université")
    /*
    .addSubcommand(
        new SlashCommandSubcommandBuilder()
        .setName("ligne")
        .setDescription("Affiche les horaires pour une ligne aux alentours de l'université")
        .addStringOption(
            new SlashCommandStringOption()
            .setName("ligne")
            .setDescription("Ligne à afficher")
            .addChoices([["C","C"],["E","E"],["F","F"],["L1","L1"],["2","2"],["30","30"]])
            .setRequired(true)
        )
    )
    */
    .addSubcommand(
        new SlashCommandSubcommandBuilder()
        .setName("station")
        .setDescription("Affiche les horaires pour une station aux alentours de l'université")
        .addStringOption(
            new SlashCommandStringOption()
            .setName("station")
            .setDescription("Station à afficher")
            .addChoices(stationsTuples)
            .setRequired(true)
        )
    )
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(tokenCTS);

(async () => {
	try {
		await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log('Successfully registered application commands.');
	} catch (error) {
		console.error(error);
	}
})();