import {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { BotServices } from "./BotServices";

// Create a TypeScript interface for the command descriptor.
export interface CommandDescriptor {
    commandName: string;
    subCommandName: string | null;
    execute(
        interaction: CommandInteraction,
        services: BotServices
    ): Promise<void>;
}

export function isCommandDescriptor(
    object: object
): object is CommandDescriptor {
    return (
        "commandName" in object &&
        "execute" in object &&
        "subCommandName" in object
    );
}
