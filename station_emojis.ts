import { getSunrise, getSunset } from "sunrise-sunset-js";

// Enum with three possible values:
// - day
// - night
// - between
enum DayNightStatus {
    day,
    night,
    between,
    horizonSun,
}

// Offset a date by a number of minutes
function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60000);
}

function getDayNightStatus(): DayNightStatus {
    // Latitude and longitude of Strasbourg
    const lat = 48.5734053;
    const lon = 7.7521113;

    // Store sunrise date
    let sunrise = getSunrise(lat, lon);
    let sunset = getSunset(lat, lon);

    // Dawn start
    let dawnStart = addMinutes(sunrise, -15);

    // Dusk
    let duskEnd = addMinutes(sunset, 20);

    // Current time
    let now = new Date();

    if (now < dawnStart) {
        return DayNightStatus.night;
    } else if (now >= dawnStart && now < sunrise) {
        return DayNightStatus.between;
    } else if (now >= sunrise && now < addMinutes(sunrise, 20)) {
        return DayNightStatus.horizonSun;
    } else if (
        now >= addMinutes(sunrise, 20) &&
        now < addMinutes(sunset, -20)
    ) {
        return DayNightStatus.day;
    } else if (now >= addMinutes(sunset, -20) && now < addMinutes(sunset, 5)) {
        return DayNightStatus.horizonSun;
    } else if (now >= addMinutes(sunset, 5) && now < duskEnd) {
        return DayNightStatus.between;
    } else {
        return DayNightStatus.night;
    }
}

export function emojiForStation(station: string): string | null {
    switch (station) {
        case "Esplanade":
            switch (getDayNightStatus()) {
                case DayNightStatus.day:
                    return "🏙";
                case DayNightStatus.between:
                    return "🌆";
                case DayNightStatus.night:
                    return "🌃";
                case DayNightStatus.horizonSun:
                    return "🌇";
                default:
                    return "🏙";
            }
        case "Palerme":
            return "🍕";
        case "Rome":
            return "🇮🇹";
        case "Université":
            return "🎓";
        case "Observatoire":
            return "🔭";
        case "Cité Administrative":
            return "🏢";
        case "Campus d'Illkirch":
            return "🔬";
        case "Musée d'Art Moderne":
            return "🧑‍🎨";
        case "Homme de Fer":
            return "⚔️";
        case "Londres":
            return "🇬🇧";
        case "Port du Rhin":
            return "⚓️";
        case "Jean Jaures":
            return "🌹";
        case "Winston Churchill":
            return "🇬🇧";
        case "Kehl Bahnhof":
            return "🇩🇪 🚉";
        case "Hochschule / Läger":
            return "🇩🇪 🎓";
        case "Kehl Rathaus":
            return "🇩🇪 🏛️";
        default:
            return null;
    }
}
