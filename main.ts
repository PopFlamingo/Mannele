
// Import discordjs library
import { Client, Intents } from 'discord.js';
import { CTSService, listVehicleStops } from './CTSService';
import { emojiForStation } from './station_emojis';

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// Store token in a variable from the DISCORD_TOKEN environment variable
const token = process.env.DISCORD_TOKEN;

// Store the CTS_TOKEN in a variable from the CTS_TOKEN environment variable
let ctsToken = process.env.CTS_TOKEN;

if (ctsToken === undefined) {
    // Throw an error if the CTS_TOKEN is not defined
    throw new Error('CTS_TOKEN environment variable is not defined');
}

const service = new CTSService(ctsToken);

client.once('ready', () => {
    console.log('Bot started');
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isCommand()) {
        return;
    }
    try {
        const { commandName } = interaction;
        if (commandName == "horaires") {
            if (interaction.options.getSubcommand() == "station") {
                let station = interaction.options.getString("station");
                if (station === null) {
                    throw new Error("No station was provided");
                }
                let stops = await service.getStopsForStation(station);
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
                    final += ("\n" + listVehicleStops(stops))
                } else {
                    // Get only the "tram" vehicles
                    let trams = stops.filter(stop => stop.transportType == "tram");
                    final += "\n**Trams  :tram: :**\n"
                    final += listVehicleStops(trams);

                    // Get only the "bus" vehicles
                    let buses = stops.filter(stop => stop.transportType == "bus");
                    final += "\n\n**Bus  :bus: :**\n"
                    final += listVehicleStops(buses);
                }

                interaction.reply(final);
                
            } else {
                interaction.reply(`Cette fonction n'est pas encore implémentée`);
            }
        } else {
            interaction.reply(`Cette fonction n'est pas encore implémentée`);
        }
    } catch(error) {
        console.error(error)
        interaction.reply(`Une erreur est survenue`);
    } 
    let sub = interaction.options.getSubcommand();
})

// Login to Discord
client.login(token);
