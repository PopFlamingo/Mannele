import { CTSService } from "./CTSService";
import { StatsService } from "./StatsService";

export class BotServices {
    cts: CTSService;
    stats: StatsService;

    // Create a constructor for the BotServices class
    constructor(cts: CTSService, stats: StatsService) {
        this.cts = cts;
        this.stats = stats;
    }
}
