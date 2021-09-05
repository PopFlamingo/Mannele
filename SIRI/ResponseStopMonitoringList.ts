import "reflect-metadata";
import { jsonObject, jsonMember, TypedJSON, jsonArrayMember } from "typedjson";

@jsonObject
class VehicleActivity {
    constructor(
        recordedAtTime: Date,
        monitoredVehicleJourney: MonitoredVehicleJourney
    ) {
        this.recordedAtTime = recordedAtTime;
        this.monitoredVehicleJourney = monitoredVehicleJourney;
    }

    @jsonMember({ name: "RecordedAtTime" })
    public recordedAtTime: Date;

    @jsonMember({ name: "MonitoredVehicleJourney" })
    public monitoredVehicleJourney: MonitoredVehicleJourney;
}

@jsonObject
class VehicleMonitoringDelivery {
    constructor(
        responseTimestamp: Date,
        validUntil: Date,
        shortestPossibleCycleTime: number,
        vehicleActivity?: VehicleActivity[]
    ) {
        this.responseTimestamp = responseTimestamp;
        this.validUntil = validUntil;
        this.shortestPossibleCycleTime = shortestPossibleCycleTime;
        this.vehicleActivity = vehicleActivity;
    }

    @jsonMember({ name: "ResponseTimestamp" })
    public responseTimestamp: Date;

    @jsonMember({ name: "ValidUntil" })
    public validUntil: Date;

    @jsonMember({ name: "ShortestPossibleCycleTime" })
    public shortestPossibleCycleTime: number;

    @jsonArrayMember(VehicleActivity, { name: "VehicleActivity" })
    public vehicleActivity?: VehicleActivity[];
}

@jsonObject
class FramedVehicleJourneyRef {
    constructor(datedVehicleJourneySAERef?: string) {
        this.datedVehicleJourneySAERef = datedVehicleJourneySAERef;
    }

    @jsonMember({ name: "DatedVehicleJourneySAERef" })
    public datedVehicleJourneySAERef?: string;
}

@jsonObject
class EstimatedVehicleJourneyCTSExtension {
    constructor(vehicleMode: VehicleMode) {
        this.vehicleMode = vehicleMode;
    }

    @jsonMember({ name: "VehicleMode", constructor: String })
    public vehicleMode: VehicleMode;
}

@jsonObject
class EstimatedCallsCTSExtension {
    constructor(isRealTime: boolean, isCheckOut: boolean, dataSource?: string) {
        this.isRealTime = isRealTime;
        this.isCheckOut = isCheckOut;
        this.dataSource = dataSource;
    }

    @jsonMember({ name: "IsRealTime" })
    public isRealTime: boolean;

    @jsonMember({ name: "IsCheckOut" })
    public isCheckOut: boolean;

    @jsonMember({ name: "DataSource" })
    public dataSource?: string;
}

@jsonObject
class EstimatedCalls {
    constructor(
        expectedArrivalTime: Date,
        extension: EstimatedCallsCTSExtension,
        stopPointRef?: string,
        stopPointName?: string,
        destinationName?: string,
        destinationShortName?: string,
        via?: string,
        expectedDepartureTime?: Date
    ) {
        this.stopPointRef = stopPointRef;
        this.stopPointName = stopPointName;
        this.destinationName = destinationName;
        this.destinationShortName = destinationShortName;
        this.via = via;
        this.expectedDepartureTime = expectedDepartureTime;
        this.expectedArrivalTime = expectedArrivalTime;
        this.extension = extension;
    }

    @jsonMember({ name: "StopPointRef" })
    public stopPointRef?: string;

    @jsonMember({ name: "StopPointName" })
    public stopPointName?: string;

    @jsonMember({ name: "DestinationName" })
    public destinationName?: string;

    @jsonMember({ name: "DestinationShortName" })
    public destinationShortName?: string;

    @jsonMember({ name: "Via" })
    public via?: string;

    @jsonMember({ name: "ExpectedDepartureTime" })
    public expectedDepartureTime?: Date;

    @jsonMember({ name: "ExpectedArrivalTime" })
    public expectedArrivalTime: Date;

    @jsonMember({ name: "Extension" })
    public extension: EstimatedCallsCTSExtension;
}

@jsonObject
class EstimatedVehicleJourney {
    constructor(
        framedVehicleJourneyRef: FramedVehicleJourneyRef,
        isCompleteStopSequence: boolean,
        extension: EstimatedVehicleJourneyCTSExtension,
        directionRef: number,
        lineRef?: string,
        publishedLineName?: string,
        estimatedCalls?: EstimatedCalls[]
    ) {
        this.lineRef = lineRef;
        this.directionRef = directionRef;
        this.framedVehicleJourneyRef = framedVehicleJourneyRef;
        this.publishedLineName = publishedLineName;
        this.isCompleteStopSequence = isCompleteStopSequence;
        this.estimatedCalls = estimatedCalls;
        this.extension = extension;
    }

    @jsonMember({ name: "LineRef" })
    public lineRef?: string;

    @jsonMember({ name: "DirectionRef" })
    public directionRef: number;

    @jsonMember({ name: "FramedVehicleJourneyRef" })
    public framedVehicleJourneyRef: FramedVehicleJourneyRef;

    @jsonMember({ name: "PublishedLineName" })
    public publishedLineName?: string;

    @jsonMember({ name: "IsCompleteStopSequence" })
    public isCompleteStopSequence: boolean;

    @jsonArrayMember(EstimatedCalls, { name: "EstimatedCalls" })
    public estimatedCalls?: EstimatedCalls[];

    @jsonMember({ name: "Extension" })
    public extension: EstimatedVehicleJourneyCTSExtension;
}

@jsonObject
class EstimatedTimetableVersionFrame {
    constructor(
        recordedAtTime: Date,
        estimatedVehicleJourney?: EstimatedVehicleJourney[]
    ) {
        this.recordedAtTime = recordedAtTime;
        this.estimatedVehicleJourney = estimatedVehicleJourney;
    }

    @jsonMember({ name: "RecordedAtTime" })
    public recordedAtTime: Date;

    @jsonArrayMember(EstimatedVehicleJourney, {
        name: "EstimatedVehicleJourney",
    })
    public estimatedVehicleJourney?: EstimatedVehicleJourney[];
}

@jsonObject
class EstimatedTimetableDelivery {
    constructor(
        responseTimestamp: Date,
        validUntil: Date,
        shortestPossibleCycle: number,
        version?: string,
        estimatedJourneyVersionFrame?: EstimatedTimetableVersionFrame[]
    ) {
        this.version = version;
        this.responseTimestamp = responseTimestamp;
        this.validUntil = validUntil;
        this.shortestPossibleCycle = shortestPossibleCycle;
        this.estimatedJourneyVersionFrame = estimatedJourneyVersionFrame;
    }

    @jsonMember({ name: "Version" })
    public version?: string;

    @jsonMember({ name: "ResponseTimestamp" })
    public responseTimestamp: Date;

    @jsonMember({ name: "ValidUntil" })
    public validUntil: Date;

    @jsonMember({ name: "ShortestPossibleCycle" })
    public shortestPossibleCycle: number;

    @jsonArrayMember(EstimatedTimetableVersionFrame, {
        name: "EstimatedJourneyVersionFrame",
    })
    public estimatedJourneyVersionFrame?: EstimatedTimetableVersionFrame[];
}

@jsonObject
class MonitoredStopVisit {
    constructor(
        recordedAtTime: Date,
        monitoredVehicleJourney: MonitoredVehicleJourney,
        monitoringRef?: string,
        stopCode?: string
    ) {
        this.recordedAtTime = recordedAtTime;
        this.monitoringRef = monitoringRef;
        this.stopCode = stopCode;
        this.monitoredVehicleJourney = monitoredVehicleJourney;
    }

    @jsonMember({ name: "RecordedAtTime" })
    public recordedAtTime: Date;

    @jsonMember({ name: "MonitoringRef" })
    public monitoringRef?: string;

    @jsonMember({ name: "StopPointRef" })
    public stopCode?: string;

    @jsonMember({ name: "MonitoredVehicleJourney" })
    public monitoredVehicleJourney: MonitoredVehicleJourney;
}

enum LangKind {
    EN = "EN",
    FR = "FR",
    DE = "DE",
}

@jsonObject
class MessageText {
    constructor(lang: LangKind, value?: string) {
        this.value = value;
        this.lang = lang;
    }

    @jsonMember({ name: "Value" })
    public value?: string;

    @jsonMember({ name: "Lang", constructor: String })
    public lang: LangKind;
}

@jsonObject
class InfoMessageContentMessage {
    constructor(messageZoneRef?: MessageZoneKind, messageText?: MessageText[]) {
        this.messageZoneRef = messageZoneRef;
        this.messageText = messageText;
    }

    @jsonMember({ name: "MessageZoneRef" })
    public messageZoneRef?: MessageZoneKind;

    @jsonArrayMember(MessageText, { name: "MessageText" })
    public messageText?: MessageText[];
}

enum MessageZoneKind {
    title = "title",
    details = "details",
    period = "period",
}

@jsonObject
class InfoMessageContent {
    constructor(
        impactStartDateTime: Date,
        priority: PriorityKind,
        sendUpdateToCustomers: boolean,
        impactEndDateTime?: Date,
        impactedGroupOfLinesRef?: string,
        impactedLineRef?: string[],
        typeOfPassengerEquipmentRef?: string,

        message?: InfoMessageContentMessage[]
    ) {
        this.impactStartDateTime = impactStartDateTime;
        this.impactEndDateTime = impactEndDateTime;
        this.impactedGroupOfLinesRef = impactedGroupOfLinesRef;
        this.impactedLineRef = impactedLineRef;
        this.typeOfPassengerEquipmentRef = typeOfPassengerEquipmentRef;
        this.priority = priority;
        this.sendUpdateToCustomers = sendUpdateToCustomers;
        this.message = message;
    }

    @jsonMember({ name: "ImpactStartDateTime" })
    public impactStartDateTime: Date;

    @jsonMember({ name: "ImpactEndDateTime" })
    public impactEndDateTime?: Date;

    @jsonMember({ name: "ImpactedGroupOfLinesRef" })
    public impactedGroupOfLinesRef?: string;

    @jsonArrayMember(String, { name: "ImpactedLineRef" })
    public impactedLineRef?: string[];

    @jsonMember({ name: "TypeOfPassengerEquipmentRef" })
    public typeOfPassengerEquipmentRef?: string;

    @jsonMember({ name: "Priority" })
    public priority: PriorityKind;

    @jsonMember({ name: "SendUpdateToCustomers" })
    public sendUpdateToCustomers: boolean;

    @jsonArrayMember(InfoMessageContentMessage, { name: "Message" })
    public message?: InfoMessageContentMessage[];
}

@jsonObject
class InfoMessage {
    constructor(
        recordedAtTime: Date,
        validUntilTime: Date,
        content: InfoMessageContent,
        formatRef?: string,
        itemIdentifier?: string,
        infoMessageIdentifier?: string,
        infoChannelRef?: InfoChannelKind
    ) {
        this.formatRef = formatRef;
        this.recordedAtTime = recordedAtTime;
        this.itemIdentifier = itemIdentifier;
        this.infoMessageIdentifier = infoMessageIdentifier;
        this.infoChannelRef = infoChannelRef;
        this.validUntilTime = validUntilTime;
        this.content = content;
    }

    @jsonMember({ name: "FormatRef" })
    public formatRef?: string;

    @jsonMember({ name: "RecordedAtTime" })
    public recordedAtTime: Date;

    @jsonMember({ name: "ItemIdentifier" })
    public itemIdentifier?: string;

    @jsonMember({ name: "InfoMessageIdentifier" })
    public infoMessageIdentifier?: string;

    @jsonMember({ name: "InfoChannelRef", constructor: String })
    public infoChannelRef?: InfoChannelKind;

    @jsonMember({ name: "ValidUntilTime" })
    public validUntilTime: Date;

    @jsonMember({ name: "Content" })
    public content: InfoMessageContent;
}

@jsonObject
class GeneralMessageDelivery {
    constructor(
        responseTimestamp: Date,
        shortestPossibleCycle: number,
        version?: string,
        infoMessage?: InfoMessage[]
    ) {
        this.version = version;
        this.responseTimestamp = responseTimestamp;
        this.shortestPossibleCycle = shortestPossibleCycle;
        this.infoMessage = infoMessage;
    }

    @jsonMember({ name: "Version" })
    public version?: string;

    @jsonMember({ name: "ResponseTimestamp" })
    public responseTimestamp: Date;

    @jsonMember({ name: "ShortestPossibleCycle" })
    public shortestPossibleCycle: number;

    @jsonArrayMember(InfoMessage, { name: "InfoMessage" })
    public infoMessage?: InfoMessage[];
}

@jsonObject
class StopMonitoringDelivery {
    constructor(
        responseTimestamp: Date,
        validUntil: Date,
        shortestPossibleCycle: number,
        monitoringRef?: string[],
        monitoredStopVisit?: MonitoredStopVisit[],
        version?: string
    ) {
        this.version = version;
        this.responseTimestamp = responseTimestamp;
        this.validUntil = validUntil;
        this.shortestPossibleCycle = shortestPossibleCycle;
        this.monitoringRef = monitoringRef;
        this.monitoredStopVisit = monitoredStopVisit;
    }

    @jsonMember({ name: "Version" })
    public version?: string;

    @jsonMember({ name: "ResponseTimestamp" })
    public responseTimestamp: Date;

    @jsonMember({ name: "ValidUntil" })
    public validUntil: Date;

    @jsonMember({ name: "ShortestPossibleCycle" })
    public shortestPossibleCycle: number;

    @jsonArrayMember(String, { name: "MonitoringRef" })
    public monitoringRef?: string[];

    @jsonArrayMember(MonitoredStopVisit, { name: "MonitoredStopVisit" })
    public monitoredStopVisit?: MonitoredStopVisit[];
}

@jsonObject
class ResponseGeneralMessageList {
    constructor(serviceDelivery: ResponseStopMonitoringList) {
        this.serviceDelivery = serviceDelivery;
    }

    @jsonMember({ name: "ServiceDelivery" })
    public serviceDelivery: ResponseStopMonitoringList;
}

@jsonObject
class ResponseStopMonitoringList {
    constructor(
        responseTimestamp: Date,
        requestMessageRef?: string,
        stopMonitoringDelivery?: StopMonitoringDelivery[],
        vehicleMonitoringDelivery?: VehicleMonitoringDelivery[],
        estimatedTimetableDelivery?: EstimatedTimetableDelivery[],
        generalMessageDelivery?: GeneralMessageDelivery[]
    ) {
        this.responseTimestamp = responseTimestamp;
        this.requestMessageRef = requestMessageRef;
        this.stopMonitoringDelivery = stopMonitoringDelivery;
        this.vehicleMonitoringDelivery = vehicleMonitoringDelivery;
        this.estimatedTimetableDelivery = estimatedTimetableDelivery;
        this.generalMessageDelivery = generalMessageDelivery;
    }

    @jsonMember({ name: "ResponseTimestamp" })
    public responseTimestamp: Date;

    @jsonMember({ name: "RequestMessageRef" })
    public requestMessageRef?: string;

    @jsonArrayMember(StopMonitoringDelivery, { name: "StopMonitoringDelivery" })
    public stopMonitoringDelivery?: StopMonitoringDelivery[];

    @jsonArrayMember(VehicleMonitoringDelivery, {
        name: "VehicleMonitoringDelivery",
    })
    public vehicleMonitoringDelivery?: VehicleMonitoringDelivery[];

    @jsonArrayMember(EstimatedTimetableDelivery, {
        name: "EstimatedTimetableDelivery",
    })
    public estimatedTimetableDelivery?: EstimatedTimetableDelivery[];

    @jsonArrayMember(GeneralMessageDelivery, { name: "GeneralMessageDelivery" })
    public generalMessageDelivery?: GeneralMessageDelivery[];
}

enum VehicleMode {
    Bus = "bus",
    Tram = "tram",
    Undefined = "undefined",
}

enum InfoChannelKind {
    Disruption = "Disruption",
    PlannedDisruption = "PlannedDisruption",
    Works = "Works",
    Information = "Information",
}

enum PriorityKind {
    Normal = "Normal",
    Urgent = "Urgent",
    Extrem = "Extrem",
}

@jsonObject
class PreviousCall {
    constructor(stopPointName?: string, stopCode?: string, order?: number) {
        this.stopPointName = stopPointName;
        this.stopCode = stopCode;
        this.order = order;
    }

    @jsonMember({ name: "StopPointName" })
    public stopPointName?: string;

    @jsonMember({ name: "StopCode" })
    public stopCode?: string;

    @jsonMember({ name: "Order" })
    public order?: number;
}

@jsonObject
class OnwardCall {
    constructor(
        stopPointName?: string,
        stopCode?: string,
        order?: number,
        expectedDepartureTime?: Date,
        expectedArrivalTime?: Date
    ) {
        this.stopPointName = stopPointName;
        this.stopCode = stopCode;
        this.order = order;
        this.expectedDepartureTime = expectedDepartureTime;
        this.expectedArrivalTime = expectedArrivalTime;
    }

    @jsonMember({ name: "StopPointName" })
    public stopPointName?: string;

    @jsonMember({ name: "StopCode" })
    public stopCode?: string;

    @jsonMember({ name: "Order" })
    public order?: number;

    @jsonMember({ name: "ExpectedDepartureTime" })
    public expectedDepartureTime?: Date;

    @jsonMember({ name: "ExpectedArrivalTime" })
    public expectedArrivalTime?: Date;
}

@jsonObject
class MonitoredVehicleJourney {
    constructor(
        lineRef: string,
        directionRef: number,
        vehicleMode: VehicleMode,
        monitoredCall: MonitoredCall,
        publishedLineName?: string,
        destinationName?: string,
        destinationShortName?: string,
        via?: string,
        previousCall?: PreviousCall[],
        onwardCall?: OnwardCall[]
    ) {
        this.lineRef = lineRef;
        this.directionRef = directionRef;
        this.vehicleMode = vehicleMode;
        this.publishedLineName = publishedLineName;
        this.destinationName = destinationName;
        this.destinationShortName = destinationShortName;
        this.via = via;
        this.monitoredCall = monitoredCall;
        this.previousCall = previousCall;
        this.onwardCall = onwardCall;
    }

    @jsonMember({ name: "LineRef" })
    public lineRef: string;

    @jsonMember({ name: "DirectionRef" })
    public directionRef: number;

    @jsonMember({ name: "VehicleMode", constructor: String })
    public vehicleMode: VehicleMode;

    @jsonMember({ name: "PublishedLineName" })
    public publishedLineName?: string;

    @jsonMember({ name: "DestinationName" })
    public destinationName?: string;

    @jsonMember({ name: "DestinationShortName" })
    public destinationShortName?: string;

    @jsonMember({ name: "Via" })
    public via?: string;

    @jsonMember({ name: "MonitoredCall" })
    public monitoredCall: MonitoredCall;

    @jsonArrayMember(PreviousCall, { name: "PreviousCall" })
    public previousCall?: PreviousCall[];

    @jsonArrayMember(OnwardCall, { name: "OnwardCall" })
    public onwardCall?: OnwardCall[];
}

@jsonObject
class MonitoredCall {
    constructor(
        expectedArrivalTime: Date,
        extension: MonitoredCallCTSExtension,
        stopPointName?: string,
        stopCode?: string,
        order?: number,
        expectedDepartureTime?: Date
    ) {
        this.stopPointName = stopPointName;
        this.stopCode = stopCode;
        this.order = order;
        this.expectedDepartureTime = expectedDepartureTime;
        this.expectedArrivalTime = expectedArrivalTime;
        this.extension = extension;
    }

    @jsonMember({ name: "StopPointName" })
    public stopPointName?: string;

    @jsonMember({ name: "StopCode" })
    public stopCode?: string;

    @jsonMember({ name: "Order" })
    public order?: number;

    @jsonMember({ name: "ExpectedDepartureTime" })
    public expectedDepartureTime?: Date;

    @jsonMember({ name: "ExpectedArrivalTime" })
    public expectedArrivalTime: Date;

    @jsonMember({ name: "Extension" })
    public extension: MonitoredCallCTSExtension;
}

@jsonObject
class MonitoredCallCTSExtension {
    constructor(isRealTime: boolean, dataSource: string) {
        this.isRealTime = isRealTime;
        this.dataSource = dataSource;
    }

    @jsonMember({ name: "IsRealTime" })
    public isRealTime: boolean;

    @jsonMember({ name: "DataSource" })
    public dataSource: string;
}