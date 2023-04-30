function getCurrentDateInTimezone(offsetInSeconds: number): Date {
    const currentDate = new Date();
    const utcDate = new Date(currentDate.getTime() - currentDate.getTimezoneOffset() * 60 * 1000);
    const targetDate = new Date(utcDate.getTime() + offsetInSeconds * 1000);
    return targetDate;
}

export function shouldDisplayMay1stCustomEmoji(): boolean {
    const emojisAvailable = process.env.MANNELE_IS_IN_EMOJI_SERVER === "true";
    const now = getCurrentDateInTimezone(7200);
    return emojisAvailable && now.getMonth() === 4 && now.getDate() === 1;
}