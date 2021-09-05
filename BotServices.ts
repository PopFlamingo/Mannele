import { CTSService } from "./CTSService";

export class BotServices {
    cts: CTSService;

    // Create a constructor for the BotServices class
    constructor(cts: CTSService) {
        this.cts = cts;
    }
}
