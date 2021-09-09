import "reflect-metadata";
import fs from "fs";
import {
    jsonObject,
    jsonMember,
    TypedJSON,
    jsonMapMember,
    jsonArrayMember,
} from "typedjson";
import crypto from "crypto";

@jsonObject
class StatsInfo {
    constructor() {
        this.slots = new Map<string, number>();
    }

    @jsonMapMember(String, Number)
    public slots: Map<string, number>;

    incrementSlot(slot: string) {
        this.slots.set(slot, (this.slots.get(slot) || 0) + 1);
    }
}

@jsonObject
export class StatsService {
    constructor(slotCount: number, excludedIDs: string[]) {
        this.slotCount = slotCount;
        this.stats = new Map<string, StatsInfo>();
        this.exludedIDs = excludedIDs;
    }

    private exludedIDs: string[];
    private basePath: string | undefined;

    @jsonMember
    public slotCount: number;

    @jsonMapMember(String, StatsInfo)
    public stats: Map<string, StatsInfo>;

    async increment(key: string, userID: string) {
        if (this.exludedIDs.includes(userID)) {
            return;
        }
        let stats = this.stats.get(key);
        if (stats === undefined) {
            stats = new StatsInfo();
            this.stats.set(key, stats);
        }

        // Use cypto to hash the userID
        let hash = crypto.createHash("sha256");
        hash.update(userID);

        // Convert the hash to a hex number string
        let hashDigest = hash.digest("hex");

        // Get the last 10 digits of the hash and convert it to a number
        let hashDigestNumber = parseInt(hashDigest.substr(-10), 16);
        stats.incrementSlot(`${hashDigestNumber % this.slotCount}`);
        if (this.basePath !== undefined) {
            this.save(this.basePath);
        }
    }

    static load(
        basePath: string,
        slotCount: number,
        excludedIDs: string[]
    ): StatsService {
        // Get date as a dd-mm-yyyy string
        let date = new Date();
        let dateString =
            date.getDate() +
            "-" +
            (date.getMonth() + 1) +
            "-" +
            date.getFullYear();

        let stats: StatsService | undefined;
        // If the file exists load its content and create a StatsService from it
        // using TypedJSON
        if (fs.existsSync(basePath + "/" + dateString + ".json")) {
            let statsFile = fs.readFileSync(
                basePath + "/" + dateString + ".json",
                "utf8"
            );
            stats = TypedJSON.parse(statsFile, StatsService);
            if (stats === undefined) {
                throw new Error("Could not parse stats file");
            }
            stats.slotCount = slotCount;
            stats.exludedIDs = excludedIDs;
        } else {
            // If the file does not exist, create a new StatsService
            stats = new StatsService(slotCount, excludedIDs);
            // Save it to the file
            fs.writeFileSync(
                basePath + "/" + dateString + ".json",
                TypedJSON.stringify(stats, StatsService)
            );
        }
        stats.basePath = basePath;
        return stats;
    }

    save(basePath: string) {
        // Save at current directory/basePath/
        let date = new Date();
        let dateString =
            date.getDate() +
            "-" +
            (date.getMonth() + 1) +
            "-" +
            date.getFullYear();
        fs.writeFileSync(
            basePath + "/" + dateString + ".json",
            TypedJSON.stringify(this, StatsService)
        );
    }

    getRawStatsCount(key: string): number {
        let stats = this.stats.get(key);
        if (stats === undefined) {
            return 0;
        }
        // Sum up all the slot counts
        let sum = 0;
        for (let slot of stats.slots.values()) {
            sum += slot;
        }
        return sum;
    }
}
