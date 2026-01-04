export type Platform = "tiktok" | "facebook" | "instagram" | "youtube" | "unknown";

export interface PlatformInfo {
    platform: Platform;
    displayName: string;
    primaryColor: string;
    secondaryColor: string;
    themeClass: string;
}

const PLATFORM_CONFIG: Record<Platform, Omit<PlatformInfo, "platform">> = {
    tiktok: {
        displayName: "TikTok",
        primaryColor: "#00f2ea",
        secondaryColor: "#ff0050",
        themeClass: "theme-tiktok",
    },
    facebook: {
        displayName: "Facebook",
        primaryColor: "#1877F2",
        secondaryColor: "#4267B2",
        themeClass: "theme-facebook",
    },
    instagram: {
        displayName: "Instagram",
        primaryColor: "#E1306C",
        secondaryColor: "#833AB4",
        themeClass: "theme-instagram",
    },
    youtube: {
        displayName: "YouTube",
        primaryColor: "#FF0000",
        secondaryColor: "#CC0000",
        themeClass: "theme-youtube",
    },
    unknown: {
        displayName: "Social Media",
        primaryColor: "#6366f1",
        secondaryColor: "#8b5cf6",
        themeClass: "",
    },
};

const URL_PATTERNS: Record<Platform, RegExp[]> = {
    tiktok: [
        /(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
        /(?:vm|vt)\.tiktok\.com\/\w+/,
        /tiktok\.com\/t\/\w+/,
        /(?:www\.)?tiktok\.com/,
    ],
    facebook: [
        /(?:www\.)?facebook\.com\/(?:watch\/?\?v=|[^/]+\/videos\/)\d+/,
        /(?:www\.)?facebook\.com\/reel\/\d+/,
        /fb\.watch\/\w+/,
        /(?:www\.)?facebook\.com/,
    ],
    instagram: [
        /(?:www\.)?instagram\.com\/(?:p|reel)\/[\w-]+/,
        /(?:www\.)?instagram\.com\/[\w.]+\/(?:p|reel)\/[\w-]+/,
        /(?:www\.)?instagram\.com/,
    ],
    youtube: [
        /(?:www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /(?:www\.)?youtube\.com\/shorts\/[\w-]+/,
        /youtu\.be\/[\w-]+/,
        /(?:www\.)?youtube\.com/,
    ],
    unknown: [],
};

/**
 * Detect the platform from a URL
 */
export function detectPlatform(url: string): Platform {
    const normalizedUrl = url.toLowerCase().trim();

    for (const [platform, patterns] of Object.entries(URL_PATTERNS) as [
        Platform,
        RegExp[],
    ][]) {
        if (platform === "unknown") continue;
        for (const pattern of patterns) {
            if (pattern.test(normalizedUrl)) {
                return platform;
            }
        }
    }

    return "unknown";
}

/**
 * Get full platform info including theme colors
 */
export function getPlatformInfo(platform: Platform): PlatformInfo {
    return {
        platform,
        ...PLATFORM_CONFIG[platform],
    };
}

/**
 * Detect platform from URL and return full info
 */
export function detectPlatformInfo(url: string): PlatformInfo {
    const platform = detectPlatform(url);
    return getPlatformInfo(platform);
}

/**
 * Extract video/post ID from URL based on platform
 */
export function extractContentId(
    url: string,
    platform: Platform,
): string | null {
    switch (platform) {
        case "tiktok": {
            const match = url.match(/\/video\/(\d+)/) || url.match(/tiktok\.com\/(?:t\/)?(\w+)/);
            return match?.[1] || null;
        }
        case "youtube": {
            const match =
                url.match(/[?&]v=([\w-]+)/) ||
                url.match(/youtu\.be\/([\w-]+)/) ||
                url.match(/\/shorts\/([\w-]+)/);
            return match?.[1] || null;
        }
        case "instagram": {
            const match = url.match(/\/(?:p|reel)\/([\w-]+)/);
            return match?.[1] || null;
        }
        case "facebook": {
            const match =
                url.match(/\/videos\/(\d+)/) ||
                url.match(/[?&]v=(\d+)/) ||
                url.match(/\/reel\/(\d+)/) ||
                url.match(/fb\.watch\/(\w+)/);
            return match?.[1] || null;
        }
        default:
            return null;
    }
}
