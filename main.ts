import "reflect-metadata";
import { BaseMessageOptions, Client, GatewayIntentBits, CommandInteraction, ActivityType, ButtonInteraction, CacheType } from "discord.js";
import { BotServices } from "./BotServices.js";
import { CommandDescriptor, isCommandDescriptor } from "./CommandDescriptor.js";
import { CTSService } from "./CTSService.js";
import { readdirSync } from "fs";
import { StatsService } from "./StatsService.js";
import { config as configDotenv } from "dotenv";

configDotenv();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Store token in a variable from the DISCORD_TOKEN environment variable
const token = process.env.DISCORD_TOKEN;

// Store the CTS_TOKEN in a variable from the CTS_TOKEN environment variable
let ctsToken = process.env.CTS_TOKEN;

if (ctsToken === undefined) {
    // Throw an error if the CTS_TOKEN is not defined
    throw new Error("CTS_TOKEN environment variable is not defined");
}

// Check STATS_SLOT_COUNT environment variable exists and save it in a variable
// otherwise throw an error
let statsSlotCountString = process.env.STATS_SLOT_COUNT;
if (statsSlotCountString === undefined) {
    throw new Error("STATS_SLOT_COUNT environment variable is not defined");
}

let statsSlotCount = parseInt(statsSlotCountString);
if (Number.isNaN(statsSlotCount)) {
    throw new Error(
        "STATS_SLOT_COUNT environment variable is not a number"
    );
}

// Check the slot count is >= 1
if (statsSlotCount < 1) {
    throw new Error("STATS_SLOT_COUNT environment variable is less than 1");
}

// Check if the STATS_EXCLUDED_USERS environment variable is defined and save it
// in a variable
let statsExcludedUsersString = process.env.STATS_EXCLUDED_USERS;
let excludedIDs: string[] = [];
if (statsExcludedUsersString !== undefined) {
    excludedIDs = statsExcludedUsersString.split(",");
}

// Check if the EPHEMERAL_ONLY_SERVERS environment variable is defined and save it
// in a variable
let ephemeralOnlyServersString = process.env.EPHEMERAL_ONLY_SERVERS;
let ephemeralOnlyServers: string[] = [];
if (ephemeralOnlyServersString !== undefined) {
    ephemeralOnlyServers = ephemeralOnlyServersString.split(",");
}

// Bot services is an object that is passed as an argument of
// all command executors and contains all the services that the bot needs
const botServices = new BotServices(
    await CTSService.make(ctsToken),
    await StatsService.load("./stats/", statsSlotCount, excludedIDs)
);

// Update every 6 hours
setInterval(async () => {
    try {
        await botServices.cts.updateNormalizedNameToStation()
    } catch (e) {
        console.error("Couldn't update stop codes", e)
    }
}, 1000 * 60 * 60 * 6);

// Create a collection associating command (and subcommand) names with their executors
const commands = new Map<string, CommandDescriptor>();

// Get the file names of all the ts files in the commands directory and remove their extension
const commandFiles = readdirSync("./commands")
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.replace(".ts", ".js"));

for (const file of commandFiles) {
    const defaultExport = (await import(`./commands/${file}`)).default;
    const instance = new defaultExport();
    if (isCommandDescriptor(instance)) {
        // Concatenate commandName and subCommandName to create a unique key
        const key = `${instance.commandName}|${instance.subCommandName}`;
        // Add the command to the commands collection
        commands.set(key, instance);
    }
}

async function defaultErrorHandler(
    error: unknown,
    interaction: CommandInteraction
) {
    console.error(error);
    let errorMessage = "Une erreur est survenue ! :slight_frown:\n";
    errorMessage +=
        "Cela peut être une erreur interne ou provenir d'un service que j'ai tenté de contacter.\n";
    await interaction.editReply({
        content: errorMessage,
        components: [],
    });
}

async function defaultButtonErrorHandler(
    error: unknown,
    interaction: ButtonInteraction<CacheType>
) {
    console.error(error);
    let errorMessage = "Une erreur est survenue ! :slight_frown:\n";
    errorMessage +=
        "Cela peut être une erreur interne ou provenir d'un service que j'ai tenté de contacter.\n";
    interaction.editReply({
        content: errorMessage,
        components: [],
    })
}

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
    let isEphemeral =
        ephemeralOnlyServers.indexOf(interaction.guildId || "") !== -1;
    if (interaction.isButton()) {
        const commandAndSubcommandName = interaction.message.interaction?.commandName
        if (commandAndSubcommandName === undefined) {
            return
        }
        // TODO: Is this the proper way to split the command name and subcommand name?
        const split = commandAndSubcommandName.split(" ")
        const command = split[0]
        let subcommand: string | null = null

        if (split.length == 2) {
            subcommand = split[1]
        } else if (split.length > 2) {
            console.error("Unexpected command name format")
            return
        }
        const key = `${command}|${subcommand}`;
        const commandDescriptor = commands.get(key);
        if (commandDescriptor === undefined) {
            console.error(`Command descriptor for ${key} not found`)
            return
        }
        if (commandDescriptor.handleButton === undefined) {
            console.error(`Command descriptor for ${key} does not have a handleButton method`)
            return
        }
        await interaction.deferUpdate();
        try {
            await commandDescriptor.handleButton(interaction, botServices)
        } catch (error) {
            if (commandDescriptor.handleButtonError !== undefined) {
                try {
                    let customErrorMessage =
                        await commandDescriptor.handleButtonError(
                            error,
                            botServices
                        );
                    if (typeof customErrorMessage === "string") {
                        await interaction.editReply({
                            content: customErrorMessage,
                            components: [],
                        });

                    } else {
                        await interaction.editReply(customErrorMessage);
                    }
                } catch (error) {
                    await defaultButtonErrorHandler(error, interaction);
                }
            } else {
                await defaultButtonErrorHandler(error, interaction);
            }
        }


        return;
    } else if (!interaction.isChatInputCommand()) {
        // It seems that even interactions that are collected using DiscordJS collectors are
        // received here
        return;
    }

    await interaction.deferReply({ ephemeral: isEphemeral });
    let command = interaction.commandName;
    let subcommand: string | null =
        interaction.options.getSubcommand(false);

    // Concantenate commandName and subCommandName to create a unique key
    // in order to retrieve the executor
    const key = `${command}|${subcommand}`;
    const commandDescriptor = commands.get(key);
    if (commandDescriptor) {
        try {
            await commandDescriptor.execute(interaction, botServices);
        } catch (error) {
            if (commandDescriptor.handleError !== undefined) {
                try {
                    let customErrorMessage =
                        await commandDescriptor.handleError(
                            error,
                            botServices
                        );
                    await interaction.editReply(customErrorMessage);
                } catch (error) {
                    await defaultErrorHandler(error, interaction);
                }
            } else {
                await defaultErrorHandler(error, interaction);
            }
        }
    }
});

client.once("ready", () => {
    console.log("Mannele is up and running!");
});

// Login to Discord
await client.login(token);

// Set activity to the name of the main command
if (client.user !== null) {
    client.user.setActivity('/horaires trams & bus', { type: ActivityType.Playing });
} else {
    console.error("Unexpected null client.user")
}

