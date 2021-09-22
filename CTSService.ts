import { linesStations, stationCodes } from "./data";
import axios, { AxiosInstance } from "axios";
import { setupCache } from "axios-cache-adapter";
import { TypedJSON } from "typedjson";
import { SpecializedStopMonitoringResponse, VehicleMode } from "./SIRITypes";
import csv from "csv-parser";
import fs from "fs";
import { emojiForStation } from "./station_emojis";
import Fuse from "fuse.js";

// Create and export an enum that stores either tram or bus
export enum TransportType {
    tram = "tram",
    bus = "bus",
}

export class LaneVisitsSchedule {
    name: string;
    transportType: VehicleMode;
    directionRef: number;
    destinationName: string;
    via: string | undefined;
    departureDates: Date[];

    // Constructor
    constructor(
        name: string,
        transportType: VehicleMode,
        directionRef: number,
        destinationName: string,
        via: string | undefined,
        departureDates: Date[]
    ) {
        this.name = name;
        this.transportType = transportType;
        this.directionRef = directionRef;
        this.destinationName = destinationName;
        this.via = via;
        this.departureDates = departureDates;
    }
}

export class StationQueryResult {
    userReadableName: string;
    stopCodes: string[];
    isExactMatch: boolean;

    // Constructor
    constructor(
        userReadableName: string,
        stopCodes: string[],
        isExactMatch: boolean = false
    ) {
        this.userReadableName = userReadableName;
        this.stopCodes = stopCodes;
        this.isExactMatch = isExactMatch;
    }
}

export class CTSService {
    static async make(token: string): Promise<CTSService> {
        // Ensure responses are cached for 30 seconds
        // to avoid hitting the CTS API too often
        const cache = setupCache({ maxAge: 30 * 1000 });

        // Create an axios instance to access the CTS API
        let api = axios.create({
            adapter: cache.adapter,
            baseURL: "https://api.cts-strasbourg.eu/v1/siri/2.0/",
            auth: {
                username: token,
                password: "",
            },
            timeout: 8000,
        });

        let stopCodes = new Map<string, StationQueryResult>();

        let stream = fs
            .createReadStream("./resources/stops.csv")
            .pipe(csv())
            .on("data", (data: any) => {
                // Get name from fifth column and normalize it
                let name = data.stop_name;
                let normalizedName = CTSService.normalize(name);
                let stopCode = data.stop_code;

                let value = stopCodes.get(normalizedName);
                // If the array doesn't exist yet, create it
                if (value === undefined) {
                    value = new StationQueryResult(name, []);
                    stopCodes.set(normalizedName, value);
                } else if (
                    (stopCodes.get(normalizedName)?.userReadableName || "") !==
                    name && process.env.LOG_CONFLICTS === "YES"
                ) {
                    console.log(normalizedName);
                    console.log(
                        stopCodes.get(normalizedName)?.userReadableName
                    );
                    console.log(name);
                    console.log("=========");
                }

                // Add the stop code to the array if it doesn't exist yet
                if (value.stopCodes.indexOf(stopCode) === -1) {
                    value.stopCodes.push(stopCode);
                }
            });

        // Wait for the stream to finish
        return new Promise((resolve, reject) => {
            stream.on("end", () => {
                resolve(new CTSService(api, stopCodes));
            });

            // Handle errors
            stream.on("error", (err: any) => {
                reject(err);
            });
        });
    }

    private constructor(
        api: AxiosInstance,
        stopCodes: Map<string, StationQueryResult>
    ) {
        this.api = api;
        this.stopCodes = stopCodes;
    }

    private api: AxiosInstance;

    // A map of array of stop codes, where keys are
    // normalized stop names
    private stopCodes: Map<string, StationQueryResult> = new Map();

    async getFormattedSchedule(
        userReadableName: string,
        stopCodes: string[]
    ): Promise<string> {
        let stops = await this.getVisitsForStopCodes(stopCodes);
        let final = `__**Horaires pour la station *${userReadableName}***__`;
        let emoji = emojiForStation(userReadableName);
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
            final += "\n" + CTSService.formatStops(stops);
        } else {
            // Get only the "tram" vehicles
            let trams = stops.filter(
                (stop: LaneVisitsSchedule) => stop.transportType == "tram"
            );
            final += "\n**Trams  :tram: :**\n";
            final += CTSService.formatStops(trams);

            // Get only the "bus" vehicles
            let buses = stops.filter(
                (stop: LaneVisitsSchedule) => stop.transportType == "bus"
            );
            final += "\n\n**Bus  :bus: :**\n";
            final += CTSService.formatStops(buses);
        }

        final +=
            "\n\n*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0))*";

        return final;
    }

    async getVisitsForStation(
        stationName: string
    ): Promise<[string, LaneVisitsSchedule[]]> {
        // Array that will store all stop codes for the station
        let queryResult = await this.getStopCodes(stationName);

        if (queryResult === undefined) {
            throw new Error("STATION_NOT_FOUND");
        }

        let readableName = queryResult.userReadableName;
        let codesList = queryResult.stopCodes;

        return [readableName, await this.getVisitsForStopCodes(codesList)];
    }

    async getVisitsForStopCodes(
        stopCodes: string[]
    ): Promise<LaneVisitsSchedule[]> {
        // Note the difference between a stop and a station:
        // A stop is a place where a tram or a bus passes in a specific
        // direction (for instance there is typically one stop on each side
        // of the rails) and you have both tramway stops and bus stops.
        // A station is a group of stops that are geographically close.
        // In general users refer to stations instead of stops, but they
        // still implicitly refer to specific stops by stating their
        // destination name, lane and transport type.

        // We query the CTS API for all the stop codes for the station
        // so we actually need to repeat the MonitoringRef query parameter
        // for each stop code.
        let params = new URLSearchParams();
        for (let code of stopCodes) {
            params.append("MonitoringRef", code);
        }

        let rawResponse = await this.api.get("/stop-monitoring", {
            params: params,
        });

        // We use a strongly typed JSON parser to parse the response
        // which eliminates a lot of boilerplate code
        const serializer = new TypedJSON(SpecializedStopMonitoringResponse, {
            errorHandler: (error: Error) => {
                throw new Error("CTS_PARSING_ERROR");
            },
        });
        let response = serializer.parse(rawResponse.data);
        if (response === undefined) {
            throw new Error("Could not parse response");
        }

        let stopMonitoringDelivery =
            response.serviceDelivery.stopMonitoringDelivery;

        // Make sure there is exactly one element in the array
        // Currently the CTS API only returns one response per request
        // but this may change at some point so this is not future-proof
        // However it's hard to understand why there would ever be more than one
        // It would be best to check with CTS why that could be the case (if ever)
        // and what to do then.
        if (stopMonitoringDelivery.length !== 1) {
            throw new Error(
                "Not exactly one stop monitoring delivery in CTS response"
            );
        }

        // An array that stores all vehicle visits for the stops we requested
        let monitoredStopVisits = stopMonitoringDelivery[0].monitoredStopVisit;

        let collector: {
            [key: string]: LaneVisitsSchedule;
        } = {};

        // This code loops over all the vehicle visits times and groups them
        // by their their (lanes / destinations / vehicle kind / [optional] via)
        // then we can for instance have a "Tramway lane Z to destination FooCity"
        // group that contains all the departure times for this specific lane/destination.
        // These lane/destination - times associations are stored in LaneVisitsSchedule
        // objects and this is what we return to the caller.
        //
        // The CTS/SIRI API doesn't provide such as feature so we have to do it ourselves.
        monitoredStopVisits.forEach((monitoredStopVisit) => {
            let info = monitoredStopVisit.monitoredVehicleJourney;

            // Get the departure time (or arrival time if there is no departure date)
            // In practice it seems there is always a departure time, but if it was
            // to be missing one day, using the arrival time would still be fine
            // Note that "arrival date means" date of arrival at the stop
            // not at some destination, so this is why its a correct fallback
            let stopTime = info.monitoredCall.expectedDepartureTime;
            if (stopTime === undefined) {
                stopTime = info.monitoredCall.expectedArrivalTime;
            }

            // If the stop time is more than 1 minute in the past or more than
            // 5 hours in the future, we ignore it
            // We are doing this to guard against cases where the API may return
            // incoherent data, this often happens at night.
            if (
                stopTime.getTime() < Date.now() - 60000 ||
                stopTime.getTime() > Date.now() + 5 * 3600 * 1000
            ) {
                return;
            }

            // The key is used to group the vehicle visits
            let key = `${info.publishedLineName}|${info.destinationName}|${info.vehicleMode}|${info.via}`;

            // If the there is already a value for this key add the departure date to the array
            if (collector[key] !== undefined) {
                collector[key].departureDates.push(stopTime);
            } else {
                // Otherwise create a new LaneVisitsSchedule object and associate it with the key
                collector[key] = new LaneVisitsSchedule(
                    info.publishedLineName,
                    info.vehicleMode,
                    info.directionRef,
                    info.destinationName,
                    info.via,
                    [stopTime]
                );
            }
        });

        // Create an array with the values of the collector
        let result = Object.values(collector);

        // Remove all the lanes that have no visits
        result = result.filter((lane) => lane.departureDates.length > 0);

        if (result.length === 0) {
            throw new Error("CTS_TIME_ERROR");
        }
        // Return all values in the collector
        return Object.values(collector);
    }

    static formatStops(vehicleStops: LaneVisitsSchedule[]): string {
        // Sort vehicleStops by directionRef. This allows us to display the stops
        // in the correct order both for a given line and accross lines
        vehicleStops.sort((a, b) => {
            return b.directionRef - a.directionRef;
        });

        // Sort vehicleStops by line name (this is a stable sort in NodeJS so we still)
        // benefit from the fact that the lines are sorted by directionRef
        vehicleStops.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        let vehicleStopsLists: string[] = [];

        // For each vehicleStop
        for (let vehicleStop of vehicleStops) {
            let formattedLine = `**${vehicleStop.name}: ${vehicleStop.destinationName}`;
            if (vehicleStop.via !== undefined) {
                formattedLine += ` via ${vehicleStop.via}`;
            }
            formattedLine += "**: ";
            // Sort departureDates by departure time, ascending
            vehicleStop.departureDates.sort((a, b) => {
                return a.getTime() - b.getTime();
            });

            let departureStrings: string[] = [];

            // For each departureDate
            for (let departureDate of vehicleStop.departureDates) {
                // Count the number of minutes until the departure
                let minutes = Math.floor(
                    (departureDate.getTime() - new Date().getTime()) / 1000 / 60
                );
                // If minutes is negative, set it to 0
                if (minutes < 0) {
                    minutes = 0;
                }

                if (minutes === 0) {
                    departureStrings.push("maintenant");
                } else if (minutes > 0) {
                    departureStrings.push(`${minutes} min`);
                }
            }

            formattedLine += departureStrings.join(", ");
            vehicleStopsLists.push(formattedLine);
        }

        var count = 0;
        var result = "";
        var lastName = "";
        // We visually group the stops by line name
        for (let vehicleStopsList of vehicleStopsLists) {
            let currentName = vehicleStopsList.split(":")[0];
            if (count > 0) {
                if (lastName == currentName) {
                    result += "\n";
                } else {
                    result += "\n\n";
                }
            }
            lastName = currentName;
            result += "> " + vehicleStopsList;
            count += 1;
        }

        return result;
    }

    // A private static method for normalizing stop names
    // We normalize the stop name by doing the following transformations:
    // - Lowercase it
    // - Remove accents
    // - Remove all non-alphanumeric characters, such as spaces, dots, etc.
    // - Remove all character repetition sequences ("ll" become "l" for example)
    static normalize(stopName: string): string {
        let lowerCaseNoAccents = stopName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        let lastCharacter = "";
        let nextString = "";

        for (let i = 0; i < lowerCaseNoAccents.length; i++) {
            let currentCharacter = lowerCaseNoAccents[i];
            if (currentCharacter == lastCharacter) {
                continue;
            } else {
                nextString += currentCharacter;
            }
            lastCharacter = currentCharacter;
        }

        return nextString.replace(/[^a-z0-9]/g, "");
    }

    async getStopCodes(
        stopName: string
    ): Promise<StationQueryResult | undefined> {
        let maybeMatch = await this.searchStops(stopName);
        if (maybeMatch === undefined) {
            return undefined;
        } else {
            return maybeMatch[0];
        }
    }

    // Get the stop codes associated with a station name
    async searchStops(stationName: string): Promise<StationQueryResult[]> {
        // Normalize the stop name
        stationName = CTSService.normalize(stationName);

        let exactlyContained: string[] = [];
        // If we find a string that contains the station name, we add it to the array
        for (let key of this.stopCodes.keys()) {
            // Check if key string contains the stop name
            if (key.indexOf(stationName) !== -1) {
                exactlyContained.push(key);
            }
        }

        // If the array only has one element and it is an exact match, return it
        if (
            exactlyContained.length === 1 &&
            exactlyContained[0] === stationName
        ) {
            let result = this.stopCodes.get(exactlyContained[0]);
            if (result === undefined) {
                throw new Error("SHOULD_NEVER_HAPPEN");
            }
            result.isExactMatch = true;
            return [result];
        } else {
            // Otherwise, we only keep the first 25 elements
            exactlyContained = exactlyContained.slice(0, 25);
        }

        // Sort exactlyContained by string size from smallest to longest
        exactlyContained.sort((a, b) => {
            return a.length - b.length;
        });

        // If we don't, make a fuzzy search instead
        let stationsCanonicalNames = Array.from(this.stopCodes.keys());
        const fuse = new Fuse(stationsCanonicalNames, { includeScore: true });
        let fuzzyResults = fuse.search(stationName);

        // Do not include results with a too bad score
        fuzzyResults = fuzzyResults.filter(
            (result) => (result.score || 1) < 0.5
        );

        // Only return the first 25 results
        fuzzyResults = fuzzyResults.slice(0, 25);

        // Map result.item to matches array
        let fuzzyMatches = fuzzyResults.map((result) => {
            return result.item;
        });

        // Copy exactlyContained to result array
        let results = exactlyContained.slice();

        // For each fuzzy match
        for (let fuzzyMatch of fuzzyMatches) {
            // If it is not already in the result array, add it
            if (results.indexOf(fuzzyMatch) === -1) {
                results.push(fuzzyMatch);
            }
        }

        // Limit result array to 25 elements
        results = results.slice(0, 25);

        // Return the value associated with the key
        return results.map((match) => {
            let value = this.stopCodes.get(match);
            if (value === undefined) {
                throw Error("Unexpected undefined value");
            }
            return value;
        });
    }
}
