import { AxiosInstance } from "axios";
import axiosModule from "axios";
const { default: axios } = axiosModule;
import axiosCacheAdapter from "axios-cache-adapter";
const { setupCache } = axiosCacheAdapter;
import fs from "fs";
import FuseModule from "fuse.js"
const Fuse = FuseModule as any;
import * as ConsumableSchedule from "./ConsumableSchedule.js";

import {
    jsonArrayMember,
    jsonMapMember,
    jsonMember,
    jsonObject,
    toJson,
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
import { hash } from "./hash.js";

// Create and export an enum that stores either tram or bus
export enum TransportType {
    tram = "tram",
    bus = "bus",
}

export type SearchResult = {
    /** 
     * Means the search engine is confident that the first result matches what the user is looking for
     * without any ambiguity. This typically means that the result can be displayed directly to the user.
     */
    firstMatchIsHighConfidence: boolean;

    /**
     * An array of named stations that match the search query, sorted from most to least relevant.
    */
    stations: NamedStation[];
};

export type SearchResultNew = {
    /** 
     * Means the search engine is confident that the first result matches what the user is looking for
     * without any ambiguity. This typically means that the result can be displayed directly to the user.
     */
    firstMatchIsHighConfidence: boolean;

    stationsAndIndices: { station: NamedStation, idx: number }[];
};

export type FlattenedMatch = {
    logicStations: LogicStation[];
    stationName: string;
    geoDescription: string | undefined;
    isExactMatch: boolean;
    path: string;
};

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
@toJson
export class NamedStation {
    @jsonMember
    userReadableName: string;

    @jsonArrayMember(ProbableExtendedStation)
    extendedStations: ProbableExtendedStation[];

    constructor(userReadableName: string) {
        this.userReadableName = userReadableName;
        this.extendedStations = [];
    }

    /**
     * Adds a stop to the named station.
     * 
     * - If no extended station exists yet, a new one containing a station with just that stop is created.
     * - If an extended station exists:
     *     - If a station with matching logic stop code exists, the stop is added to that station.
     *     - If no station with the matching logic stop code exists, but the stop is close enough to an existing station, the stop is added to that station.
     *     - If no station with the matching logic stop code exists, and the stop is not close enough to any existing station, a new extended station is created.
     * 
     * The reasoning behind this is explained in [this blog post](https://blog.popflamingo.fr/public-transit-bot).
     * 
     * @param logicStopCode The logic stop code of the stop to add
     * @param location The location of the stop to add
     */
    addStop(logicStopCode: string, location: SIRILocation) {
        this.addLogicStation(new LogicStation(logicStopCode, location))
    }

    private addLogicStation(logicStation: LogicStation) {
        // Find the closest probable extended station
        let closestProbableExtendedStation: ProbableExtendedStation | undefined = undefined;
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

        if (closestProbableExtendedStation === undefined) {
            // If there is probable extended station yet, create one...
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
            // ...otherwise, if the closest probable extended station contains a station with the same logic stop code
            // we add this stop to it (which effectively consists in averaging the location of the two stops)...
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
            // ... if there was no match, but the closest probable extended station is too far away, we create a new one
            // because we are probably facing two completely different extended stations...
            closestProbableExtendedStation = new ProbableExtendedStation([
                logicStation,
            ]);
            this.extendedStations.push(closestProbableExtendedStation);
        } else {
            // ... but if they are close enough, it means two stations with different logic stop codes
            // are probably part of the same extended station, so we add the new station to the closest one.
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

        let normalizedNameToStation = await CTSService.getNamedStations(ctsAPI);

        return new CTSService(ctsAPI, normalizedNameToStation.value, normalizedNameToStation.hash);
    }

    private static async getNamedStations(ctsAPI: AxiosInstance): Promise<{ value: Map<string, NamedStation>, hash: string }> {
        let geoGouvAPI = axios.create({
            baseURL: "https://api-adresse.data.gouv.fr",
            timeout: 8000,
        });

        let normalizedNameToStation = new Map<string, NamedStation>();
        let hashValue: string;

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

            const sortedStops = response.stopPointsDelivery.annotatedStopPointRef.sort((a, b) => {
                return a.stopPointRef > b.stopPointRef ? 1 : -1;
            });

            // Iterate over all stop points and group them by their normalized name
            // which effectively creates stations made of multiple stops
            // See docs/stop-points-to-stations.md for more information
            for (let stop of sortedStops) {
                const name = stop.stopName;
                const normalizedName = CTSService.normalize(name);
                const logicalStopCode = stop.extension.logicalStopCode;

                let namedStation = normalizedNameToStation.get(normalizedName);
                // If the named station doesn't exist yet, create it
                if (namedStation === undefined) {
                    namedStation = new NamedStation(name);
                    namedStation.addStop(logicalStopCode, stop.location);
                    normalizedNameToStation.set(normalizedName, namedStation);
                } else {
                    namedStation.addStop(logicalStopCode, stop.location);
                }
            }

            // Loop through all named stations
            for (const [_, namedStation] of normalizedNameToStation) {
                // Count the total number of logical stations in the named station
                let totalLogicalStations = 0;
                for (const probableExtendedStation of namedStation.extendedStations) {
                    totalLogicalStations +=
                        probableExtendedStation.logicStations.length;
                }

                // If there is more than one logical station, loop through all logical stations...
                if (totalLogicalStations > 1) {
                    for (const extendedStation of namedStation.extendedStations) {
                        for (const logicalStation of extendedStation.logicStations) {
                            // ...and store their address
                            const desc = await CTSService.getReverseGeocodedAddress(
                                geoGouvAPI,
                                logicalStation.location
                            );

                            logicalStation.geocodedAddress = `${desc.street} ${desc.postalCode} ${desc.city}`;
                        }
                    }
                }

                // If the named stations contains more than one probable extended station
                // in other terms if multiple stations that are far away from each other
                // share the same name...
                if (namedStation.extendedStations.length > 1) {
                    // ...We get inverse geocoding data which includes street name, postal code and city.
                    const geoFeatures: AddressDescription[] = [];
                    for (let extendedStation of namedStation.extendedStations) {
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
                    for (let i = 0; i < namedStation.extendedStations.length; i++) {
                        const extendedStation = namedStation.extendedStations[i];
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
            hashValue = await hash(JSON.stringify(normalizedNameToStation))
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
            const stringValue = fs.readFileSync("./resources/last-query-results.json", "utf8");
            const savedResults = savedResultsSerializer.parse(stringValue);
            if (savedResults !== undefined) {
                normalizedNameToStation = savedResults.normalizedNameToStation;
                hashValue = await hash(JSON.stringify(normalizedNameToStation))
                // Same as above but this time store full date + time using the argument of the function
                process.env.LAST_STOP_UPDATE = CTSService.formatDateFR(savedResults.date)

            } else {
                throw new Error(`Couldn't recover from error`);
            }
        }

        console.log("Stations hash is " + hashValue)

        return { value: normalizedNameToStation, hash: hashValue };
    }

    /**
     * Format a date in the "dd/mm/yyyy à hh:mm (heure de Paris)" format
     * @param date Date to format
     */
    private static formatDateFR(date: Date): string {
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


    private static async getReverseGeocodedAddress(
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
        normalizedNameToStation: Map<string, NamedStation>,
        hash: string
    ) {
        this.api = api;
        this.normalizedNameToStation = normalizedNameToStation;
        this.hash = hash
    }

    private api: AxiosInstance;

    private normalizedNameToStation: Map<string, NamedStation> = new Map();

    hash: string;

    getExtendedStationFromPath(path: string): { name: string, value: ProbableExtendedStation, locationDescription: string | undefined } {
        // The path is of the form normalizedNameToStationIdx/probableExtendedStationIdx|hash
        // If the hash is not the same as the one we have, we throw an appropriate error
        // Finally, if the path is invalid, we return undefined
        const pathParts = path.split("|");
        if (pathParts.length !== 2) {
            throw new Error("INVALID_PATH_FORMAT");
        }

        const hash = pathParts[1];
        if (hash !== this.hash) {
            throw new Error("HASH_MISMATCH");
        }

        // Now we split the first part of the path
        const stationAndIdx = pathParts[0].split("/");
        if (stationAndIdx.length !== 2) {
            throw new Error("INVALID_PATH_FORMAT");
        }

        const stationIdx = parseInt(stationAndIdx[0]);
        const probableExtendedStationIdx = parseInt(stationAndIdx[1]);

        // Check that the indexes are valid
        if (isNaN(stationIdx) || isNaN(probableExtendedStationIdx)) {
            throw new Error("INVALID_PATH_FORMAT");
        }

        // Now we get the station, check that the indexes are valid and return the probable extended station
        const station = Array.from(this.normalizedNameToStation.values())[stationIdx];
        if (station === undefined) {
            throw new Error("INVALID_TOP_LEVEL_INDEX");
        }

        const probableExtendedStation = station.extendedStations[probableExtendedStationIdx];

        if (probableExtendedStation === undefined) {
            throw new Error("INVALID_SECOND_LEVEL_INDEX");
        }

        let locationDescription: string | undefined;

        if (station.extendedStations.length > 1) {
            locationDescription = probableExtendedStation.distinctiveLocationDescription;
        } else {
            locationDescription = undefined;
        }

        return { name: station.userReadableName, value: probableExtendedStation, locationDescription: locationDescription };
    }

    getStationAndIdxFromNormalizedName(normalizedName: string): { station: NamedStation, idx: number } | undefined {
        const station = this.normalizedNameToStation.get(normalizedName);
        if (station !== undefined) {
            // We find the index of the station whose key is normalizedName
            const idx = Array.from(this.normalizedNameToStation.keys()).indexOf(normalizedName);
            return { station: station, idx: idx };
        } else {
            return undefined;
        }
    }

    async updateNormalizedNameToStation() {
        const stationsFetchResult = await CTSService.getNamedStations(this.api);
        this.normalizedNameToStation = stationsFetchResult.value;
        this.hash = stationsFetchResult.hash
    }

    static aggregateRawVisitSchedules(rawSchedule: LaneVisitsSchedule[]): ConsumableSchedule.Lane[] {
        const lanes: ConsumableSchedule.Lane[] = [];
        function add(visitSchedule: LaneVisitsSchedule) {
            const lane = lanes.find((lane) => lane.name == visitSchedule.name);
            const times = visitSchedule.departureDates.map((date) => new ConsumableSchedule.Visit(date));
            const direction = new ConsumableSchedule.Direction(
                times,
                visitSchedule.name,
                visitSchedule.destinationName,
                visitSchedule.via ? visitSchedule.via : null,
                visitSchedule.directionRef
            );
            if (lane === undefined) {
                lanes.push(new ConsumableSchedule.Lane(visitSchedule.name, [direction]))
            } else {
                lane.directions.push(direction);
            }
        }
        rawSchedule.forEach(add);
        for (let lane of lanes) {
            lane.directions.sort((a, b) => {
                return b.directionTag - a.directionTag;
            });

            lane.directions.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
        }
        return lanes;
    }

    async getVisitsStore(userReadableName: string, logicStopCodes: string[]): Promise<ConsumableSchedule.NamedStationVisitsStore> {
        const unmerged = await this.getVisitsForStopCodes(logicStopCodes);
        const merged = CTSService.mergeVisitsIfAppropriate(unmerged);
        merged.sort((a, b) => {
            return b[1].length - a[1].length;
        });
        const stations = merged.map((station) => {
            const isMerged = station[0].length > 1;
            const busLanes = station[1].filter((lane) => lane.transportType == "bus");
            const tramLanes = station[1].filter((lane) => lane.transportType == "tram");

            busLanes.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });

            tramLanes.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });

            return new ConsumableSchedule.Station(
                isMerged,
                CTSService.aggregateRawVisitSchedules(busLanes),
                CTSService.aggregateRawVisitSchedules(tramLanes)
            )
        });
        return new ConsumableSchedule.NamedStationVisitsStore(userReadableName, emojiForStation(userReadableName), stations);
    }

    static formatLane(lane: ConsumableSchedule.Lane): string {
        let final = "";
        for (let direction of lane.directions) {
            final += `> **${direction.fullLaneDescription}**: `;
            let time: ConsumableSchedule.Visit | undefined;
            while ((time = direction.popVisit()) !== undefined) {
                final += `${time.formattedOffsetFR}`;
                if (direction.peekVisit() !== undefined) {
                    final += ", ";
                }
            }
            final += "\n";
        }
        return final;
    }

    static formatLanes(lanes: ConsumableSchedule.Lane[]): string {
        let final = "";
        for (let [idx, lane] of lanes.entries()) {
            final += CTSService.formatLane(lane);
            if (idx < lanes.length - 1) {
                final += "\n";
            }
        }
        return final;
    }

    async getFormattedSchedule(userReadableName: string, logicStopCodes: string[]): Promise<string> {
        const store = await this.getVisitsStore(userReadableName, logicStopCodes);
        let final = "";
        const multipleStations = store.length > 1;
        if (multipleStations) {
            final += `⚠️ Avertissement: Affichage des résultats pour ${store.length} stations potentiellement distinctes. __Voir les détails plus bas.__\n\n`;
        }
        final += `__**Horaires pour *${store.name}***__`;
        if (store.emoji !== null) {
            final += `  ${store.emoji}`;
        }
        final += "\n\n";
        let station: ConsumableSchedule.Station | undefined;
        let mergedStations = false;
        while ((station = store.popStation()) !== undefined) {
            if (station.isMerged) {
                final += "⚠️ Avertissement: Plusieurs données ont été fusionnées automatiquement. __Voir les détails plus bas.__\n\n";
                mergedStations = true;
            }

            if (station.hasSingleTypeOfLane) {
                const all = station.getMergedLanes();
                final += CTSService.formatLanes(all);
            } else {
                final += "**Trams :tram:**\n";
                final += CTSService.formatLanes(station.tramLanes);
                final += "\n";
                final += "**Bus :bus:**\n";
                final += CTSService.formatLanes(station.busLanes);

            }
            if (store.peekStation() !== undefined) {
                final += "\n====================\n\n";
            }
        }

        if (mergedStations || multipleStations) {
            final += "\n====================\n\n";
        }

        if (multipleStations) {
            final +=
                'Les données de la CTS définissent plusieurs "stations" pour votre requête. ';
            final +=
                "Cela peut avoir différentes significations selon les cas : stations se complétant entre elles, ";
            final +=
                "stations réellement distinctes, ou encore données tout simplement erronées.\n";
            final +=
                "Notez que comme toujours les différents *arrêts* faisant partie d'une même ";
            final +=
                "*station* peuvent être relativement éloignés les uns des autres.";
        }

        if (mergedStations) {
            if (multipleStations) {
                final += "\n\n";
            }
            final +=
                'Les horaires ci-dessus correspondent à plusieurs "stations" ';
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


        final += "\n*Certains horaires peuvent être théoriques - Some schedules may be theorical*\n";
        final += "*Exactitude non garantie - Accuracy not guaranteed - ([en savoir plus/see more](<https://gist.github.com/PopFlamingo/74fe805c9017d81f5f8baa7a880003d0>))*";
        return final;
    }

    /**
     * 
     * @param stopCodes Logic stop codes (maybe other types of codes too, todo: check)
     * @returns An array of [stopCode, schedule] pairs
     */
    private async getVisitsForStopCodes(
        stopCodes: string[]
    ): Promise<[string, LaneVisitsSchedule[]][]> {
        const result: [string, LaneVisitsSchedule[]][] = [];
        for (let stopCode of stopCodes) {
            const schedule = await this.getVisitsForStopCode([stopCode]);
            result.push([stopCode, schedule]);
        }
        return result;
    }

    private static mergeVisitsIfAppropriate(
        stationsAndVisits: [string, LaneVisitsSchedule[]][],
    ): [string[], LaneVisitsSchedule[]][] {
        // This is the same as input but converted to the correct shape
        // and is useful in some cases where we don't want to actually merge anything...
        const unmergedReshaped: [string[], LaneVisitsSchedule[]][] = stationsAndVisits.map(([station, visits]) => {
            return [[station], visits];
        });

        // ... like if there is just one or no element
        if (stationsAndVisits.length <= 1) {
            return unmergedReshaped;
        }

        // Make copy of stationsAndVisits array (we need to modify it)
        const stationsAndVisitsCopy = stationsAndVisits.slice();
        const [firstStation, firstVisits] = stationsAndVisitsCopy.shift()!;
        let results: [string[], LaneVisitsSchedule[]][] = [[[firstStation], firstVisits]];

        while (stationsAndVisitsCopy.length > 0) {
            const [stopCodeToMerge, visitsToMerge] = stationsAndVisitsCopy.shift()!;
            for (let i = 0; i < results.length; i++) {
                const [_, resultVisits] = results[i];
                for (let j = 0; j < visitsToMerge.length; j++) {
                    let elementToMergeVisit = visitsToMerge[j];
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
                        // If we find any element that is in both arrays, we cancel the merge.
                        // The reason why is that this means instead of completing themselves
                        // the stations are likely distinct even tho they are part of the same extended station
                        // (see "Ile de France" station in [the blog post](https://blog.popflamingo.fr/public-transit-bot))
                        return unmergedReshaped;
                    }
                }
                results[i][0].push(stopCodeToMerge);
                results[i][1] = results[i][1].concat(visitsToMerge);
            }
        }

        return results;
    }

    private async getVisitsForStopCode(
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
        const monitoredStopVisits = stopMonitoringDelivery[0].monitoredStopVisit || [];

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

        // Return all values in the collector
        return Object.values(collector);
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
            return maybeMatch.stations[0];
        }
    }

    /**
     * 
     * @param searchedStationName The name of the station to search for
     * @returns An array of StationQueryResult objects
     */
    async searchStation(searchedStationName: string): Promise<SearchResult> {
        const result = await this.searchStationNew(searchedStationName);
        return {
            stations: result.stationsAndIndices.map(stationOrPath => stationOrPath.station),
            firstMatchIsHighConfidence: result.firstMatchIsHighConfidence,
        }
    }

    async searchFlattenedStation(searchedStationName: string): Promise<FlattenedMatch[]> {
        let searchResult = (await this.searchStationNew(searchedStationName)) || [];

        // We will now flatten the array of matches, what this means is that
        // we are going to take all extended stations and put them in a single array
        let flattenedMatches: FlattenedMatch[] = [];
        for (let [resultIdx, { station: matchingStation, idx: topIdx }] of searchResult.stationsAndIndices.entries()) {
            for (let [secondIdx, extendedStation] of matchingStation.extendedStations.entries()) {
                flattenedMatches.push({
                    logicStations: extendedStation.logicStations,
                    stationName: matchingStation.userReadableName,
                    geoDescription:
                        extendedStation.distinctiveLocationDescription,
                    isExactMatch: resultIdx == 0 && searchResult.firstMatchIsHighConfidence,
                    path: `${topIdx}/${secondIdx}|${this.hash}`,
                });
            }
        }

        return flattenedMatches;
    }

    /**
     * 
     * @param searchedStationName The name of the station to search for
     * @returns An array of StationQueryResult objects
     */
    async searchStationNew(searchedStationName: string): Promise<SearchResultNew> {
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
            let result = this.getStationAndIdxFromNormalizedName(exactlyContained[0]);
            if (result === undefined) {
                throw new Error("SHOULD_NEVER_HAPPEN");
            }
            return { stationsAndIndices: [result], firstMatchIsHighConfidence: true };
        } else {
            // Otherwise, we only keep the first 25 elements
            exactlyContained = exactlyContained.slice(0, 25);
        }

        // Sort exactlyContained by string size from smallest to longest
        exactlyContained.sort((a, b) => {
            return a.length - b.length;
        });
        // const Fuse: Fuse.default = require("fuse.js");
        // If we don't, make a fuzzy search instead
        const normalizedNames = Array.from(this.normalizedNameToStation.keys());
        const fuse: FuseModule.default<string> = new Fuse(normalizedNames, { includeScore: true });
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
        return {
            stationsAndIndices: results.map((match) => {
                const value = this.getStationAndIdxFromNormalizedName(match);
                if (value === undefined) {
                    throw Error("Unexpected undefined value");
                }
                return value;
            }),
            firstMatchIsHighConfidence: false
        };
    }
}
