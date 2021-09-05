import { linesStations, stationCodes } from "./data";
import axios, { AxiosInstance } from "axios";
import { setupCache } from "axios-cache-adapter";
import { TypedJSON } from "typedjson";
import {
    ResponseGeneralMessageList,
    StopMonitoringDelivery,
} from "./SIRITypesSpecialized";

const getKeyValue = (key: string) => (obj: Record<string, any>) => obj[key];

// Create and export an enum that stores either tram or bus
export enum TransportType {
    tram = "tram",
    bus = "bus",
}

export class LaneDepartureSchedule {
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

    async getStopsForStation(
        stationName: string
    ): Promise<LaneDepartureSchedule[]> {
        // Check stationCodes[stationName] is not undefined, otherwise throw an error
        if (stationCodes[stationName] === undefined) {
            throw new Error("Station not found");
        }

        let kinds = [TransportType.tram, TransportType.bus];
        let codesList: string[] = [];
        // For each kind of transport
        for (let kind of kinds) {
            let codes = stationCodes[stationName][kind];
            if (codes === undefined) {
                continue;
            }
            // Add codes to the list
            codesList = codesList.concat(codes);
        }

        let params = new URLSearchParams();
        for (let code of codesList) {
            params.append("MonitoringRef", code);
        }

        let response = await this.api.get("/stop-monitoring", {
            params: params,
        });
        let data = response.data;

        const serializer = new TypedJSON(ResponseGeneralMessageList);
        let parsed = serializer.parse(data);
        if (parsed === undefined) {
            throw new Error("Could not parse response");
        }

        let stopMonitoringDelivery =
            parsed.serviceDelivery.stopMonitoringDelivery;
        // Make sure there is exactly one element in the array
        if (stopMonitoringDelivery.length !== 1) {
            throw new Error(
                "Not exactly one stop monitoring delivery in CTS response"
            );
        }

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

        // For each element in the monitoredStopVisit array
        monitoredStopVisits.forEach((monitoredStopVisit) => {
            let vehicleInfo = monitoredStopVisit.monitoredVehicleJourney;
            let publishedLineName = vehicleInfo.publishedLineName;
            let destinationName = vehicleInfo.destinationName;
            let vehicleMode = vehicleInfo.vehicleMode;
            let directionRef = vehicleInfo.directionRef;
            let via = vehicleInfo.via;
            let monitoredCall = vehicleInfo.monitoredCall;

            // Get the departure date (or arrival date if there is no departure date)
            let stopDate = monitoredCall.expectedDepartureTime;
            if (stopDate === undefined) {
                stopDate = monitoredCall.expectedArrivalTime;
            }

            let viaForKey = via;
            // If via is null replace it with an empty string
            if (viaForKey === null) {
                viaForKey = "";
            }

            let key = `${publishedLineName}|${destinationName}|${vehicleMode}|${via}`;

            // If the key is already in the collector, add the departure date to the array
            if (collector[key] !== undefined) {
                collector[key][0].push(stopDate);
            } else {
                collector[key] = [
                    [stopDate],
                    publishedLineName,
                    destinationName,
                    vehicleMode,
                    directionRef,
                    via,
                ];
            }
        });

        // Create an array of VehicleStop objects from the collector
        let vehicleStops: LaneDepartureSchedule[] = [];
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
                new LaneDepartureSchedule(
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

export function listVehicleStops(
    vehicleStops: LaneDepartureSchedule[]
): string {
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
