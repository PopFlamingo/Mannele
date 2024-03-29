import { BaseMessageOptions, ButtonInteraction, CacheType, ChatInputCommandInteraction } from "discord.js";
import { BotServices } from "./BotServices.js";


// Create a TypeScript interface for the command descriptor.
export interface CommandDescriptor {
    commandName: string;
    subCommandName: string | null;
    execute(
        interaction: ChatInputCommandInteraction<CacheType>,
        services: BotServices
    ): Promise<void>;
    handleError?: (error: unknown, services: BotServices) => Promise<string | BaseMessageOptions>;
    handleButton?: (interaction: ButtonInteraction<CacheType>, services: BotServices) => Promise<void>;
    handleButtonError?: (error: unknown, services: BotServices) => Promise<string | BaseMessageOptions>;
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
