import { CTSService } from "./CTSService.js";
import { StatsService } from "./StatsService.js";

export class BotServices {
    cts: CTSService;
    stats: StatsService;

    // Create a constructor for the BotServices class
    constructor(cts: CTSService, stats: StatsService) {
        this.cts = cts;
        this.stats = stats;
    }
}
