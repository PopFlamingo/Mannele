export class StationCodes {
    name: string;
    codes: string[];

    constructor(name: string, codes: string[]) {
        this.name = name;
        this.codes = codes;
    }
}

export let stationCodes: { [key: string]: { [key: string]: string[] } } = {
    Esplanade: {
        tram: ["185C", "185D"],
        bus: ["185A", "185B", "185C", "185D"],
    },
    Observatoire: {
        tram: ["438E", "438F"],
        bus: ["438A", "438B", "438D", "438G", "438H"],
    },
    Université: {
        tram: ["638A", "638B"],
        bus: ["638E", "638F"],
    },
    Palerme: {
        bus: ["458A", "458B"],
    },
    Rome: {
        bus: ["543A", "543B"],
    },
    "Cité Administrative": {
        bus: ["96A", "96B"],
    },
    "Campus d'Illkirch": {
        tram: ["75B", "75C"],
        bus: ["75A", "75I"],
    },
};

export let linesStations: { [key: string]: StationCodes[] } = {};
linesStations["C"] = [
    {
        name: "Esplanade",
        codes: ["185C", "185D"],
    },
    {
        name: "Université",
        codes: ["638A", "638B"],
    },
    {
        name: "Observatoire",
        codes: ["438E", "438F"],
    },
];
linesStations["E"] = [
    {
        name: "Esplanade",
        codes: ["185C", "185D"],
    },
    {
        name: "Université",
        codes: ["638A", "638B"],
    },
    {
        name: "Observatoire",
        codes: ["438E", "438F"],
    },
];
linesStations["F"] = [
    {
        name: "Université",
        codes: ["638A", "638B"],
    },
    {
        name: "Observatoire",
        codes: ["438E", "438F"],
    },
];
linesStations["L1"] = [
    {
        name: "Esplanade",
        codes: ["185A", "185B"],
    },
];
linesStations["N2"] = [
    {
        name: "Esplanade",
        codes: ["185A", "185B"],
    },
];
