import { AxiosInstance } from "axios";
import axiosModule from "axios";
const { default: axios } = axiosModule;
import axiosCacheAdapter from "axios-cache-adapter";
const { setupCache } = axiosCacheAdapter;
import fs from "fs";
import fuseModule from "fuse.js";
const { default: Fuse } = fuseModule;
import {
    jsonArrayMember,
    jsonMapMember,
    jsonMember,
    jsonObject,
    TypedJSON,
} from "typedjson";
import { FeatureCollection } from "geojson";
import {
    ResponseStopPointsDiscoveryList,
    SpecializedStopMonitoringResponse,
    SIRILocation,
    VehicleMode,
} from "./SIRITypes.js";
import { emojiForStation } from "./station_emojis.js";

// Create and export an enum that stores either tram or bus
export enum TransportType {
    tram = "tram",
    bus = "bus",
}

/**
 * Represents the visit times of for a lane at a station
 */
export class LaneVisitsSchedule {
    /**
     * The name of the lane
     */
    name: string;

    /**
     * The type of transport 
     */
    transportType: VehicleMode;

    /**
     * An integer representing the direction of the lane
     */
    directionRef: number;

    /**
     * The name of the destination
    */
    destinationName: string;

    /**
     * The name of a place that the vehicle will pass through before reaching the destination, if any.
    */
    via: string | undefined;

    /**
     * An array of dates representing the departure times of the lane
    */
    departureDates: Date[];

    /**
     * Constructs a new LaneVisitsSchedule
     * @param name The name of the lane
     * @param transportType The type of transport
     * @param directionRef An integer representing the direction of the lane
     * @param destinationName The name of the destination
     * @param via The name of a place that the vehicle will pass through before reaching the destination, if any.
     * @param departureDates An array of dates representing the departure times of the lane
     */
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

@jsonObject
export class LogicStation {
    constructor(logicStopCode: string, location: SIRILocation) {
        this.logicStopCode = logicStopCode;
        this.location = location;
    }

    @jsonMember
    logicStopCode: string;

    @jsonMember
    location: SIRILocation;

    @jsonMember
    geocodedAddress?: string;

    @jsonMember
    stopCount: number = 1;

    @jsonMember
    maxDistance: number = 0;
}

@jsonObject
export class ProbableExtendedStation {
    constructor(logicStations: LogicStation[]) {
        this.logicStations = logicStations;
    }

    // All stations that are part of the probable extended station
    @jsonArrayMember(LogicStation)
    logicStations: LogicStation[];

    // A string that enables differentiating between different probable extended stations
    @jsonMember
    distinctiveLocationDescription?: string;

    // Returns the average location of the probable extended station
    getAverageLocation(): SIRILocation {
        let averageLat = 0;
        let averageLon = 0;
        for (const logicStation of this.logicStations) {
            averageLat += logicStation.location.latitude;
            averageLon += logicStation.location.longitude;
        }
        averageLat /= this.logicStations.length;
        averageLon /= this.logicStations.length;
        return new SIRILocation(averageLat, averageLon);
    }
}
/**
 * A NamedStation is one or multiple stations that have a certain name.
 * 
 * This probably isn't the cleanest abstraction, but the codebase has evolved that way
 * organically in an attempt to best handle the specifities of the data source.
 * See [this blog post](https://blog.popflamingo.fr/public-transit-bot) for more details on this.
 */
@jsonObject
export class NamedStation {
    @jsonMember
    userReadableName: string;

    @jsonMember
    isExactMatch: boolean;

    @jsonArrayMember(ProbableExtendedStation)
    extendedStations: ProbableExtendedStation[];

    constructor(userReadableName: string, isExactMatch: boolean = false) {
        this.userReadableName = userReadableName;
        this.isExactMatch = isExactMatch;
        this.extendedStations = [];
    }

    addLogicStation(logicStation: LogicStation) {
        // Find the closest probable extended station
        let closestProbableExtendedStation:
            | ProbableExtendedStation
            | undefined = undefined;
        let closestProbableExtendedStationDistance = Number.MAX_SAFE_INTEGER;
        for (const probableExtendedStation of this.extendedStations) {
            let distance = probableExtendedStation
                .getAverageLocation()
                .distanceTo(logicStation.location);
            if (distance < closestProbableExtendedStationDistance) {
                closestProbableExtendedStation = probableExtendedStation;
                closestProbableExtendedStationDistance = distance;
            }
        }
        let existingStation: LogicStation | undefined = undefined;
        // If there is no closest probable extended station, create one
        if (closestProbableExtendedStation === undefined) {
            closestProbableExtendedStation = new ProbableExtendedStation([
                logicStation,
            ]);
            this.extendedStations.push(closestProbableExtendedStation);
        } else if (
            (existingStation =
                closestProbableExtendedStation.logicStations.find(
                    (otherStation) =>
                        otherStation.logicStopCode ===
                        logicStation.logicStopCode
                )) !== undefined
        ) {
            let currentAverageLatSum =
                existingStation.location.latitude * existingStation.stopCount;
            let currentAverageLonSum =
                existingStation.location.longitude * existingStation.stopCount;

            let distance = logicStation.location.distanceTo(
                existingStation.location
            );

            if (distance > existingStation.maxDistance) {
                existingStation.maxDistance = distance;
            }

            let nextAverageLat =
                (currentAverageLatSum + logicStation.location.latitude) /
                (existingStation.stopCount + 1);
            let nextAverageLon =
                (currentAverageLonSum + logicStation.location.longitude) /
                (existingStation.stopCount + 1);

            existingStation.location.latitude = nextAverageLat;
            existingStation.location.longitude = nextAverageLon;

            existingStation.stopCount += 1;
            return;
        } else if (closestProbableExtendedStationDistance > 150) {
            // If the closest probable extended station is further away than 150 meters, create a new one
            closestProbableExtendedStation = new ProbableExtendedStation([
                logicStation,
            ]);
            this.extendedStations.push(closestProbableExtendedStation);
        } else {
            // If the closest probable extended station is closer than 150 meters
            closestProbableExtendedStation.logicStations.push(logicStation);
        }
    }
}

@jsonObject
class CachedStations {
    constructor(map: Map<string, NamedStation>, date: Date) {
        this.normalizedNameToStation = map;
        this.date = date;
    }

    @jsonMapMember(String, NamedStation)
    normalizedNameToStation: Map<string, NamedStation>;

    @jsonMember
    date: Date;
}

type AddressDescription = {
    street: string;
    postalCode: string;
    city: string;
};

export class CTSService {
    static async make(token: string): Promise<CTSService> {
        // Ensure responses are cached for 30 seconds
        // to avoid hitting the CTS API too often
        const cache = setupCache({ maxAge: 30 * 1000 });

        // Create an axios instance to access the CTS API
        let ctsAPI = axios.create({
            adapter: cache.adapter,
            baseURL: "https://api.cts-strasbourg.eu/v1/siri/2.0/",
            auth: {
                username: token,
                password: "",
            },
            timeout: 8000,
        });

        let normalizedNameToStation = await CTSService.loadNamedStations(ctsAPI);

        return new CTSService(ctsAPI, normalizedNameToStation);
    }

    static async loadNamedStations(ctsAPI: AxiosInstance): Promise<Map<string, NamedStation>> {
        let geoGouvAPI = axios.create({
            baseURL: "https://api-adresse.data.gouv.fr",
            timeout: 8000,
        });

        let normalizedNameToStation = new Map<string, NamedStation>();

        try {
            if (process.env.LOAD_STOPS_FROM_CACHE === "YES") {
                console.log("LOAD_STOPS_FROM_CACHE=\"YES\", do not use in production");
                throw new Error("LOAD_FROM_CACHE");
            }
            let rawResponse = await ctsAPI.get("stoppoints-discovery");

            const serializer = new TypedJSON(ResponseStopPointsDiscoveryList, {
                errorHandler: (error: Error) => {
                    console.log(error);
                    throw new Error("CTS_PARSING_ERROR");
                },
            });

            let response = serializer.parse(rawResponse.data);

            if (response === undefined) {
                throw new Error("CTS_PARSING_ERROR");
            }

            // Iterate over all stop points and group them by their normalized name
            // which effectively creates stations made of multiple stops
            // See docs/stop-points-to-stations.md for more information
            for (let stop of response.stopPointsDelivery
                .annotatedStopPointRef) {
                const name = stop.stopName;
                const normalizedName = CTSService.normalize(name);
                const logicalStopCode = stop.extension.logicalStopCode;

                let value = normalizedNameToStation.get(normalizedName);
                // If the query result doesn't exist yet, create it
                if (value === undefined) {
                    value = new NamedStation(name, false);
                    value.addLogicStation(
                        new LogicStation(logicalStopCode, stop.location)
                    );
                    normalizedNameToStation.set(normalizedName, value);
                } else {
                    value.addLogicStation(
                        new LogicStation(logicalStopCode, stop.location)
                    );
                }
            }

            // Loop through all query results with their keys and values
            for (const [_, value] of normalizedNameToStation) {
                // Count the total number of logical stations in the query result
                let totalLogicalStations = 0;
                for (const probableExtendedStation of value.extendedStations) {
                    totalLogicalStations +=
                        probableExtendedStation.logicStations.length;
                }

                // If there is more than one logical station, loop through all logical stations...
                if (totalLogicalStations > 1) {
                    for (const probableExtendedStation of value.extendedStations) {
                        for (const logicalStation of probableExtendedStation.logicStations) {
                            // ...and store their address
                            const desc = await CTSService.getReverseGeocodedAddress(
                                geoGouvAPI,
                                logicalStation.location
                            );

                            logicalStation.geocodedAddress = `${desc.street} ${desc.postalCode} ${desc.city}`;
                        }
                    }
                }

                // If the query results contains more than one probable extended station
                // in other terms if multiple stations that are far away from each other
                // share the same name
                if (value.extendedStations.length > 1) {
                    // We query geo.gouv.fr to get inverse geocoding data
                    // which includes street name, postal code and city.
                    const geoFeatures: AddressDescription[] = [];
                    for (let extendedStation of value.extendedStations) {
                        const addressDescription =
                            await CTSService.getReverseGeocodedAddress(
                                geoGouvAPI,
                                extendedStation.getAverageLocation()
                            );
                        geoFeatures.push(addressDescription);
                    }

                    // Detect if postcode + city alone is enough to uniquely identify the station
                    // and set mustUseStreet to true otherwise
                    const cityNamePostCodes: Set<string> = new Set();
                    let mustUseStreet = false;
                    for (let geoFeature of geoFeatures) {
                        let combined = `${geoFeature.postalCode} ${geoFeature.city}`;
                        if (cityNamePostCodes.has(combined)) {
                            mustUseStreet = true;
                            break;
                        } else {
                            cityNamePostCodes.add(combined);
                        }
                    }

                    // Use the geocoding results to create the distinctiveLocationDescription
                    for (let i = 0; i < value.extendedStations.length; i++) {
                        const extendedStation = value.extendedStations[i];
                        const geoFeature = geoFeatures[i];

                        extendedStation.distinctiveLocationDescription = "";
                        if (mustUseStreet) {
                            extendedStation.distinctiveLocationDescription +=
                                geoFeature.street + ", ";
                        }
                        extendedStation.distinctiveLocationDescription +=
                            geoFeature.postalCode + " ";
                        extendedStation.distinctiveLocationDescription +=
                            geoFeature.city;
                    }
                }
            }

            const saveData = new CachedStations(normalizedNameToStation, new Date());
            const savedResultsSerializer = new TypedJSON(CachedStations);
            const savedResults = savedResultsSerializer.stringify(saveData);
            // Save to ./data/last-query-results.json
            fs.writeFileSync(
                "./resources/last-query-results.json",
                savedResults
            );
            process.env.LAST_STOP_UPDATE = CTSService.formatDateFR(saveData.date)

        } catch (e) {
            if (e instanceof Error && e.message === "LOAD_FROM_CACHE") {
                console.log("Loading from cache");
            } else {
                console.error("Loading from cache because of error:");
                console.error(e);
            }

            // Load the last query results from ./data/last-query-results.json
            const savedResultsSerializer = new TypedJSON(CachedStations);
            const savedResults = savedResultsSerializer.parse(
                fs.readFileSync("./resources/last-query-results.json", "utf8")
            );
            if (savedResults !== undefined) {
                normalizedNameToStation = savedResults.normalizedNameToStation;
                // Same as above but this time store full date + time using the argument of the function
                process.env.LAST_STOP_UPDATE = CTSService.formatDateFR(savedResults.date)

            } else {
                throw new Error(`Couldn't recover from error`);
            }
        }

        return normalizedNameToStation
    }

    /**
     * Format a date in the "dd/mm/yyyy à hh:mm (heure de Paris)" format
     * @param date Date to format
     */
    static formatDateFR(date: Date): string {
        const dateString = date.toLocaleDateString("fr-FR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: "Europe/Paris"
        });

        const timeString = date.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Europe/Paris"
        });

        return `${dateString} à ${timeString} (heure de Paris)`;
    }


    static async getReverseGeocodedAddress(
        axiosInstance: AxiosInstance,
        location: SIRILocation
    ): Promise<AddressDescription> {
        const featureCollection: FeatureCollection = (
            await axiosInstance.get("reverse", {
                params: {
                    lat: location.latitude,
                    lon: location.longitude,
                },
            })
        ).data;

        const firstPoint = featureCollection.features[0].properties;

        if (firstPoint !== null) {
            const street = firstPoint.name;
            const postalCode = firstPoint.postcode;
            const city = firstPoint.city;
            // If any is undefined, throw an error
            if (
                street === undefined ||
                postalCode === undefined ||
                city === undefined
            ) {
                throw new Error(
                    "Could not find address description for location"
                );
            }

            return {
                street: street,
                postalCode: postalCode,
                city: city,
            };
        } else {
            throw new Error("Could not find address description for location");
        }
    }

    private constructor(
        api: AxiosInstance,
        normalizedNameToStation: Map<string, NamedStation>
    ) {
        this.api = api;
        this.normalizedNameToStation = normalizedNameToStation;
    }

    private api: AxiosInstance;
    // A map of array of stop codes, where keys are
    // normalized stop names
    private normalizedNameToStation: Map<string, NamedStation> = new Map();


    // Async function updateStopCodes()
    async updateNormalizedNameToStation() {
        this.normalizedNameToStation = await CTSService.loadNamedStations(this.api);
    }

    async getFormattedSchedule(
        userReadableName: string,
        stopCodes: string[],
        codesAddresses: Map<string, [string, SIRILocation, number]> = new Map()
    ): Promise<string> {
        let other = await this.getVisitsForStopCodes(stopCodes);
        let merged = this.mergeVisitsIfAppropriate(other, stopCodes);
        // Put the stations with most lines first
        merged.sort((a, b) => {
            return b[1].length - a[1].length;
        });

        let final = "";
        const separateStations = merged.length > 1;
        let multipleMerged: boolean;
        const firstElement = merged[0];
        if (firstElement !== undefined) {
            let stations = firstElement[0];
            multipleMerged = !separateStations && stations.length > 1;
        } else {
            multipleMerged = false;
        }
        if (separateStations) {
            final += "⚠️ Avertissement: ";
            final += `Il y a plusieurs résultats pour "${userReadableName}".\n`;
            final += "__Voir détails plus bas.__";
        } else if (multipleMerged) {
            final +=
                "⚠️ Avertissement: Les horaires de plusieurs stations portant le même nom ";
            final += "ont étés fusionnés (voir détails plus bas).\n\n";
        }

        for (let stationsNamesAndSchedules of merged) {
            if (separateStations) {
                final += "\n\n=============================\n";
            }
            const stops = stationsNamesAndSchedules[1];

            final += `__**Horaires pour *${userReadableName}***__`;
            const emoji = emojiForStation(userReadableName);
            if (emoji !== null) {
                final += `  ${emoji}`;
            }
            final += "\n";
            // Count the number of unique types of vehicles
            const types = new Set();
            for (let stop of stops) {
                types.add(stop.transportType);
            }
            if (types.size <= 1) {
                final += "\n" + CTSService.formatStops(stops);
            } else {
                // Get only the "tram" vehicles
                const trams = stops.filter(
                    (stop: LaneVisitsSchedule) => stop.transportType == "tram"
                );
                final += "\n**Trams  :tram: :**\n";
                final += CTSService.formatStops(trams);

                // Get only the "bus" vehicles
                const buses = stops.filter(
                    (stop: LaneVisitsSchedule) => stop.transportType == "bus"
                );
                final += "\n\n**Bus  :bus: :**\n";
                final += CTSService.formatStops(buses);
            }
        }
        if (separateStations) {
            final += "\n\n=============================";
            final +=
                '\n\nLes données de la CTS définissent plusieurs "stations" pour votre requête. ';
            final +=
                "Cela peut avoir différentes significations selon les cas : stations se complétant entre elles, ";
            final +=
                "stations réellement distinctes, ou encore données tout simplement erronées.\n";
            final +=
                "Notez que comme toujours les différents *arrêts* faisant partie d'une même ";
            final +=
                "*station* peuvent être relativement éloignés les uns des autres.";
        } else if (multipleMerged) {
            final +=
                '\n\nLes horaires ci-dessus correspondent à plusieurs "stations" ';
            final += "théoriquement distinctes mais que j'ai fusionné ";
            final +=
                " car je considère qu'elles semblent se compléter entre elles. ";
            final +=
                "Notez que comme toujours les différents *arrêts* faisant partie d'une même ";
            final +=
                "*station* peuvent être relativement éloignés les uns des autres. ";
            final +=
                "**__Je peux toutefois me tromper et les données peuvent également être erronées.__**";
        }

        final +=
            "\n\n*Certains horaires peuvent être théoriques - Some schedules may be theorical*\n";
        final +=
            "*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](<https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0>))*";

        return final;
    }

    async getVisitsForStopCodes(
        stopCodes: string[]
    ): Promise<[string, LaneVisitsSchedule[]][]> {
        const result: [string, LaneVisitsSchedule[]][] = [];
        for (let stopCode of stopCodes) {
            try {
                const schedule = await this.getVisitsForStopCode([stopCode]);
                result.push([stopCode, schedule]);
            } catch (e) { }
        }
        return result;
    }

    mergeVisitsIfAppropriate(
        stationsAndVisits: [string, LaneVisitsSchedule[]][],
        stopCodes: string[]
    ): [string[], LaneVisitsSchedule[]][] {
        let results: [string[], LaneVisitsSchedule[]][] = [];
        let mustNotMerge = false;
        for (let [station, _] of stationsAndVisits) {
            if (stopCodes.indexOf(station) == -1) {
                mustNotMerge = true;
            }
        }

        if (mustNotMerge || stationsAndVisits.length <= 1) {
            results = [];
            for (const stop of stopCodes) {
                const maybeSchedule = stationsAndVisits.find((element) => {
                    return element[0] == stop;
                });
                if (maybeSchedule !== undefined) {
                    results.push([[maybeSchedule[0]], maybeSchedule[1]]);
                } else {
                    results.push([[stop], []]);
                }
            }
            return results;
        }

        // Make copy of stationsAndVisits array (we need to modify it)
        const stationsAndVisitsCopy = stationsAndVisits.slice();

        // Initialize the result array
        if (stationsAndVisits.length > 0) {
            results = [
                [[stationsAndVisitsCopy[0][0]], stationsAndVisitsCopy[0][1]],
            ];
            // Remove first element from stationsAndVisitsCopy
            stationsAndVisitsCopy.splice(0, 1);
        }

        let existingDuplicate = false;
        while (stationsAndVisitsCopy.length > 0 && !existingDuplicate) {
            const elementToMerge = stationsAndVisitsCopy[0];
            const elementToMergeStopCode = elementToMerge[0];
            const elementToMergeVisits = elementToMerge[1];
            for (let i = 0; i < results.length && !existingDuplicate; i++) {
                const result = results[i];
                const resultVisits = result[1];

                for (
                    let j = 0;
                    j < elementToMergeVisits.length && !existingDuplicate;
                    j++
                ) {
                    let elementToMergeVisit = elementToMergeVisits[j];
                    if (
                        resultVisits.findIndex((resultSchedule) => {
                            return (
                                resultSchedule.name ===
                                elementToMergeVisit.name &&
                                resultSchedule.transportType ===
                                elementToMergeVisit.transportType &&
                                resultSchedule.destinationName ===
                                elementToMergeVisit.destinationName &&
                                resultSchedule.via === elementToMergeVisit.via
                            );
                        }) != -1
                    ) {
                        existingDuplicate = true;
                    }
                }

                if (!existingDuplicate) {
                    results[i][0].push(elementToMergeStopCode);
                    results[i][1] = results[i][1].concat(elementToMergeVisits);
                }
            }

            // Remove first element from stationsAndVisitsCopy
            stationsAndVisitsCopy.splice(0, 1);
        }

        // If there is any existing duplicate, we don't merge anything anymore
        if (existingDuplicate) {
            results = [];
            for (const toAdd of stationsAndVisits) {
                results.push([[toAdd[0]], toAdd[1]]);
            }
        }

        return results;
    }

    async getVisitsForStopCode(
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
        const params = new URLSearchParams();
        for (const code of stopCodes) {
            params.append("MonitoringRef", code);
        }

        const rawResponse = await this.api.get("/stop-monitoring", {
            params: params,
        });

        // We use a strongly typed JSON parser to parse the response
        // which eliminates a lot of boilerplate code
        const serializer = new TypedJSON(SpecializedStopMonitoringResponse, {
            errorHandler: (error: Error) => {
                throw new Error("CTS_PARSING_ERROR");
            },
        });
        const response = serializer.parse(rawResponse.data);
        if (response === undefined) {
            throw new Error("Could not parse response");
        }

        const stopMonitoringDelivery =
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
        const monitoredStopVisits = stopMonitoringDelivery[0].monitoredStopVisit;

        const collector: {
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
            const info = monitoredStopVisit.monitoredVehicleJourney;

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
            const key = `${info.publishedLineName}|${info.destinationName}|${info.vehicleMode}|${info.via}`;

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
        if (vehicleStops.length === 0) {
            return "Il ne semble pas y avoir de passages pour le moment.";
        }

        // Sort vehicleStops by directionRef. This allows us to display the stops
        // in the correct order both for a given line and accross lines
        vehicleStops.sort((a, b) => {
            return b.directionRef - a.directionRef;
        });

        // Sort vehicleStops by line name (this is a stable sort in NodeJS so we still
        // benefit from the fact that the lines are sorted by directionRef)
        vehicleStops.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        const vehicleStopsLists: string[] = [];

        // For each vehicleStop
        for (const vehicleStop of vehicleStops) {
            let formattedLine = `**${vehicleStop.name}: ${vehicleStop.destinationName}`;
            if (vehicleStop.via !== undefined) {
                formattedLine += ` via ${vehicleStop.via}`;
            }
            formattedLine += "**: ";
            // Sort departureDates by departure time, ascending
            vehicleStop.departureDates.sort((a, b) => {
                return a.getTime() - b.getTime();
            });

            const departureStrings: string[] = [];

            // For each departureDate
            for (const departureDate of vehicleStop.departureDates) {
                // Count the number of minutes until the departure
                let minutes = Math.round(
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

        let count = 0;
        let result = "";
        let lastName = "";
        // We visually group the stops by line name
        for (const vehicleStopsList of vehicleStopsLists) {
            const currentName = vehicleStopsList.split(":")[0];
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
        const lowerCaseNoAccents = stopName
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
    ): Promise<NamedStation | undefined> {
        const maybeMatch = await this.searchStation(stopName);
        if (maybeMatch === undefined) {
            return undefined;
        } else {
            return maybeMatch[0];
        }
    }

    /**
     * 
     * @param searchedStationName The name of the station to search for
     * @returns An array of StationQueryResult objects
     */
    async searchStation(searchedStationName: string): Promise<NamedStation[]> {
        // Normalize the stop name
        searchedStationName = CTSService.normalize(searchedStationName);

        let exactlyContained: string[] = [];
        // If we find a string that contains the station name, we add it to the array
        for (const key of this.normalizedNameToStation.keys()) {
            // Check if key string contains the stop name
            if (key.indexOf(searchedStationName) !== -1) {
                exactlyContained.push(key);
            }
        }

        // If the array only has one element and it is an exact match, return it
        if (
            exactlyContained.length === 1 &&
            exactlyContained[0] === searchedStationName
        ) {
            let result = this.normalizedNameToStation.get(exactlyContained[0]);
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
        const normalizedNames = Array.from(this.normalizedNameToStation.keys());
        const fuse = new Fuse(normalizedNames, { includeScore: true });
        let fuzzyResults = fuse.search(searchedStationName);

        // Do not include results with a too bad score
        fuzzyResults = fuzzyResults.filter(
            (result) => (result.score || 1) < 0.5
        );

        // Only return the first 25 results
        fuzzyResults = fuzzyResults.slice(0, 25);

        // Map result.item to matches array
        const fuzzyMatches = fuzzyResults.map((result) => {
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
            const value = this.normalizedNameToStation.get(match);
            if (value === undefined) {
                throw Error("Unexpected undefined value");
            }
            return value;
        });
    }
}
