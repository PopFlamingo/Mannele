import { CTSRequestsCacher } from "./CTSRequestsCacher";
import { linesStations, stationCodes } from "./data";
import * as fs from "fs";

const getKeyValue = (key: string) => (obj: Record<string, any>) => obj[key];

// Create and export an enum that stores either tram or bus
export enum TransportType {
    tram = "tram",
    bus = "bus",
}

export class VehicleStop {
    name: string;
    transportType: TransportType;
    directionRef: number;
    destinationName: string;
    via: string | null;
    departureDates: Date[];

    // Constructor
    constructor(
        name: string,
        transportType: TransportType,
        directionRef: number,
        destinationName: string,
        via: string | null,
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
        this.cacher = new CTSRequestsCacher(token);
    }
    private cacher: CTSRequestsCacher;

    async getStopsForStation(stationName: string): Promise<VehicleStop[]> {
        let url = "https://api.cts-strasbourg.eu/v1/siri/2.0/stop-monitoring";

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

        let first = true;
        codesList.forEach((code) => {
            if (first) {
                url += "?";
                first = false;
            } else {
                url += "&";
            }
            url += `MonitoringRef=${code}`;
        });

        let response = await this.cacher.sendRequest(url);

        // Make sure response is not empty
        if (response === undefined) {
            throw new Error("No response");
        }

        let serviceDelivery = response.ServiceDelivery;
        if (serviceDelivery === undefined) {
            throw new Error("No service delivery");
        }

        let stopMonitoringDelivery = serviceDelivery.StopMonitoringDelivery;
        // Check stopMonitoringDelivery is not undefined, otherwise throw an error
        if (stopMonitoringDelivery === undefined) {
            throw new Error("No stop monitoring delivery");
        }

        // Make sure there is exactly one element in the array
        if (stopMonitoringDelivery.length !== 1) {
            throw new Error("More than one stop monitoring delivery");
        }

        let monitoredStopVisits = stopMonitoringDelivery[0].MonitoredStopVisit;
        // Check monitoredStopVisit is not undefined, otherwise throw an error
        if (monitoredStopVisits === undefined) {
            throw new Error("No monitored stop visit");
        }

        let collector: {
            [key: string]: [
                Date[],
                string,
                string,
                string,
                number,
                string | null
            ];
        } = {};

        // For each element in the monitoredStopVisit array
        monitoredStopVisits.forEach((monitoredStopVisit: any) => {
            // Store the MonitoredVehicleJourney element and check it is not undefined
            let monitoredVehicleJourney =
                monitoredStopVisit.MonitoredVehicleJourney;
            if (monitoredVehicleJourney === undefined) {
                return;
            }
            // Get the PublishedLineName element and check it is not undefined
            let publishedLineName = monitoredVehicleJourney.PublishedLineName;
            if (publishedLineName === undefined) {
                return;
            }
            // Get the DestinationName element and check it is not undefined
            let destinationName = monitoredVehicleJourney.DestinationName;
            if (destinationName === undefined) {
                return;
            }

            // Get the VehicleMode element and check it is not undefined
            let vehicleMode = monitoredVehicleJourney.VehicleMode;
            if (vehicleMode === undefined) {
                return;
            }

            // Get DirectionRef element and check it is not undefined
            let directionRef = monitoredVehicleJourney.DirectionRef;
            if (directionRef === undefined) {
                return;
            }

            // Get the Via element and check it is not undefined
            let via = monitoredVehicleJourney.Via;
            if (via === undefined) {
                return;
            }

            // Get the MonitoredCall element and check it is not undefined
            let monitoredCall = monitoredVehicleJourney.MonitoredCall;
            if (monitoredCall === undefined) {
                return;
            }

            // Get the ExpectedDepartureTime element and check it is not undefined
            let expectedDepartureTime = monitoredCall.ExpectedDepartureTime;
            if (expectedDepartureTime === undefined) {
                return;
            }

            // Convert the ExpectedDepartureTime element to a Date object
            // The ExpectedDepartureTime element is in a format like this:
            // "2020-05-01T12:00:00+02:00"
            let departureDate = new Date(expectedDepartureTime);

            let data = [publishedLineName, destinationName, via];

            let viaForKey = via;
            // If via is null replace it with an empty string
            if (viaForKey === null) {
                viaForKey = "";
            }

            let key = `${publishedLineName}|${destinationName}|${vehicleMode}|${via}`;

            // If the key is already in the collector, add the departure date to the array
            if (collector[key] !== undefined) {
                collector[key][0].push(departureDate);
            } else {
                collector[key] = [
                    [departureDate],
                    publishedLineName,
                    destinationName,
                    vehicleMode,
                    directionRef,
                    via,
                ];
            }
        });

        // Create an array of VehicleStop objects from the collector
        let vehicleStops: VehicleStop[] = [];
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
                new VehicleStop(
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

export function listVehicleStops(vehicleStops: VehicleStop[]): string {
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
        if (vehicleStop.via !== null) {
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
