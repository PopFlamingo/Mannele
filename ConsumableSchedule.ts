export class NamedStationVisitsStore {
    name: string;
    emoji: string | null;
    private stations: Station[];

    constructor(name: string, emoji: string | null, stations: Station[]) {
        this.name = name;
        this.emoji = emoji;
        this.stations = stations;
    }

    peekStation(): Station | undefined {
        return this.stations[0];
    }

    popStation(): Station | undefined {
        return this.stations.shift();
    }

    get length(): number {
        return this.stations.length;
    }
}

export class Station {
    isMerged: boolean;
    busLanes: Lane[];
    tramLanes: Lane[];

    constructor(isMerged: boolean, busLanes: Lane[], tramLanes: Lane[]) {
        this.isMerged = isMerged;
        this.busLanes = busLanes;
        this.tramLanes = tramLanes;
    }

    getMergedLanes(): Lane[] {
        return this.busLanes.concat(this.tramLanes);
    }

    get hasBusLanes(): boolean {
        return this.busLanes.length > 0;
    }

    get hasTramLanes(): boolean {
        return this.tramLanes.length > 0;
    }

    get hasLanes(): boolean {
        return this.hasBusLanes || this.hasTramLanes;
    }

    get hasSingleTypeOfLane(): boolean {
        return this.hasBusLanes !== this.hasTramLanes;
    }

    get hasVisits(): boolean {
        return this.busLanes.some(lane => lane.directions.some(direction => direction.visits.length > 0))
            || this.tramLanes.some(lane => lane.directions.some(direction => direction.visits.length > 0));
    }
}

export class Lane {
    name: string;
    directions: Direction[];

    constructor(name: string, directions: Direction[]) {
        this.name = name;
        this.directions = directions;
    }

    peekDirection(): Direction | undefined {
        return this.directions[0];
    }

    popDirection(): Direction | undefined {
        return this.directions.shift();
    }
}

export class Direction {
    visits: Visit[];
    name: string;
    destination: string;
    via: string | null;
    directionTag: number;

    constructor(times: Visit[], name: string, destination: string, via: string | null, directionTag: number) {
        this.visits = times;
        this.name = name;
        this.destination = destination;
        this.via = via;
        this.directionTag = directionTag;
    }

    get fullLaneDescription(): string {
        return this.name + ": " + this.destination + (this.via ? " via " + this.via : "");
    }

    peekVisit(): Visit | undefined {
        return this.visits[0];
    }

    popVisit(): Visit | undefined {
        return this.visits.shift();
    }
}

export class Visit {
    time: Date;

    constructor(time: Date) {
        this.time = time;
    }

    get minuteOffset(): number {
        // Compute how many minutes in the future this visit is
        let now = new Date();
        let diff = this.time.getTime() - now.getTime();
        return Math.round(diff / 60000);
    }

    get formattedOffsetFR(): string {
        let offset = this.minuteOffset;
        if (offset <= 0) {
            return "maintenant";
        } else {
            return offset + " min";
        }
    }
}