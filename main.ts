import "reflect-metadata";
import { Client, Intents, Collection, CommandInteraction } from "discord.js";
import { BotServices } from "./BotServices";
import { CommandDescriptor, isCommandDescriptor } from "./CommandDescriptor";
import { CTSService } from "./CTSService";
import * as fs from "fs";

require("dotenv").config();

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// Store token in a variable from the DISCORD_TOKEN environment variable
const token = process.env.DISCORD_TOKEN;

// Store the CTS_TOKEN in a variable from the CTS_TOKEN environment variable
let ctsToken = process.env.CTS_TOKEN;

if (ctsToken === undefined) {
    // Throw an error if the CTS_TOKEN is not defined
    throw new Error("CTS_TOKEN environment variable is not defined");
}

// Bot services is an object that is passed as an argument of
// all command executors and contains all the services that the bot needs
const botServices = new BotServices(new CTSService(ctsToken));

// Create a collection associating command (and subcommand) names with their executors
const commands = new Collection<string, CommandDescriptor>();

// Get the file names of all the ts files in the commands directory and remove their extension
const commandFiles = fs
    .readdirSync("./commands")
    .filter((file) => file.endsWith(".ts"))
    .map((file: string) => file.slice(0, -3));

for (const file of commandFiles) {
    const defaultExport = require(`./commands/${file}`).default;
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
    let errorMessage = "Une erreur est survenue ! :slight_frown:\n";
    errorMessage +=
        "Cela peut être une erreur interne ou provenir d'un service que j'ai tenté de contacter.\n";
    await interaction.editReply(errorMessage);
}

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) {
        return;
    }
    await interaction.deferReply();
    let command = interaction.commandName;
    let subcommand: string | null = interaction.options.getSubcommand(false);

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
                    await commandDescriptor.handleError(
                        error,
                        interaction,
                        botServices
                    );
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
client.login(token);
