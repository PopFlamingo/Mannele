import { linesStations, stationCodes } from "./data";
import axios, { AxiosInstance } from "axios";
import { setupCache } from "axios-cache-adapter";
import { TypedJSON } from "typedjson";
import {
    SpecializedResponseGeneralMessageList,
    StopMonitoringDelivery,
} from "./SIRITypes";

const getKeyValue = (key: string) => (obj: Record<string, any>) => obj[key];

// Create and export an enum that stores either tram or bus
export enum TransportType {
    tram = "tram",
    bus = "bus",
}

export class LaneVisitsSchedule {
    name: string;
    transportType: TransportType;
    directionRef: number;
    destinationName: string;
    via: string | undefined;
    departureDates: Date[];

    // Constructor
    constructor(
        name: string,
        transportType: TransportType,
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

export class CTSService {
    constructor(token: string) {
        // Ensure responses are cached for 30 seconds
        // to avoid hitting the CTS API too often
        const cache = setupCache({ maxAge: 30 * 1000 });

        // Create an axios instance to access the CTS API
        this.api = axios.create({
            adapter: cache.adapter,
            baseURL: "https://api.cts-strasbourg.eu/v1/siri/2.0/",
            auth: {
                username: token,
                password: "",
            },
        });
    }

    private api: AxiosInstance;

    async getVisitsForStation(
        stationName: string
    ): Promise<LaneVisitsSchedule[]> {
        // Note the difference between a stop and a station:
        // A stop is a place where a tram or a bus passes in a specific
        // direction (for instance there is typically one stop on each side
        // of the rails) and you have both tramway stops and bus stops.
        // A station is a group of stops that are geographically close.
        // In general users refer to stations instead of stops, but they
        // still implicitly refer to specific stops by stating their
        // destination name, lane and transport type.

        // Check there we have corresponding stop codes for
        // the requested station name
        if (stationCodes[stationName] === undefined) {
            throw new Error("Station not found");
        }

        // Array containing all the transport kinds
        let kinds = Object.values(TransportType);

        // Array that will store all stop codes for the station
        let codesList: string[] = [];

        // Aggregate the codes from all types of transport (ie: get
        // codes for both tram and bus stops at the selected station).
        // We are requesting stop times for all kinds of transports at once
        // and we only differentiate them in the response processing code.
        // This is a deliberate choice as this would otherwise require
        // multiple requests for the same station (one per transport type)
        // which is not ideal in terms of performance and pressure on the CTS API.
        for (let kind of kinds) {
            let codes = stationCodes[stationName][kind];
            if (codes === undefined) {
                continue;
            }
            codesList = codesList.concat(codes);
        }

        // We query the CTS API for all the stop codes for the station
        // so we actually need to repeat the MonitoringRef query parameter
        // for each stop code.
        let params = new URLSearchParams();
        for (let code of codesList) {
            params.append("MonitoringRef", code);
        }

        let response = await this.api.get("/stop-monitoring", {
            params: params,
        });

        // We use a strongly typed JSON parser to parse the response
        // which eliminates a lot of boilerplate code
        const serializer = new TypedJSON(SpecializedResponseGeneralMessageList);
        let parsed = serializer.parse(response.data);
        if (parsed === undefined) {
            throw new Error("Could not parse response");
        }

        let stopMonitoringDelivery =
            parsed.serviceDelivery.stopMonitoringDelivery;

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
            [key: string]: [
                Date[],
                string,
                string,
                string,
                number,
                string | undefined
            ];
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

            let key = `${info.publishedLineName}|${info.destinationName}|${info.vehicleMode}|${info.via}`;

            // If the key is already in the collector, add the departure date to the array
            if (collector[key] !== undefined) {
                collector[key][0].push(stopTime);
            } else {
                collector[key] = [
                    [stopTime],
                    info.publishedLineName,
                    info.destinationName,
                    info.vehicleMode,
                    info.directionRef,
                    info.via,
                ];
            }
        });

        // Create an array of VehicleStop objects from the collector
        let vehicleStops: LaneVisitsSchedule[] = [];
        for (let key in collector) {
            let [
                departureDates,
                publishedLineName,
                destinationName,
                vehicleMode,
                directionRef,
                via,
            ] = collector[key];
            vehicleStops.push(
                new LaneVisitsSchedule(
                    publishedLineName,
                    vehicleMode as TransportType,
                    directionRef,
                    destinationName,
                    via,
                    departureDates
                )
            );
        }
        return vehicleStops;
    }
}

export function listVehicleStops(vehicleStops: LaneVisitsSchedule[]): string {
    // Sort vehicleStops by directionRef
    vehicleStops.sort((a, b) => {
        if (a.directionRef < b.directionRef) {
            return -1;
        } else if (a.directionRef > b.directionRef) {
            return 1;
        } else {
            return 0;
        }
    });

    // Sort vehicleStops by line name
    vehicleStops.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });

    let vehicleStopsLists: string[] = [];

    // For each vehicleStop
    for (let vehicleStop of vehicleStops) {
        let result = `**${vehicleStop.name}: ${vehicleStop.destinationName}`;
        if (vehicleStop.via !== undefined) {
            result += ` via ${vehicleStop.via}`;
        }
        result += "**: ";
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

        result += departureStrings.join(", ");
        vehicleStopsLists.push(result);
    }

    var count = 0;
    var result = "";
    var lastName = "";
    // For each vehicleStopList
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
