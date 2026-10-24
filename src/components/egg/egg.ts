// Which song wakes the Happy ending egg (see HappyEnding.tsx).

/** "What do you want more than a Happy ending?" on NetEase Cloud Music. */
export const HAPPY_ENDING_PATH = "netease:3448017288";
/** The doves fly past once a play, when the song first reaches 2:22. */
export const DOVES_AT = 142;

/** On for that song in every theme but the archive. */
export const isHappyEnding = (path: string | null | undefined, theme: string) => path === HAPPY_ENDING_PATH && theme !== "archive";
