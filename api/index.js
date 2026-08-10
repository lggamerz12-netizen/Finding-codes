const axios = require('axios');
const cheerio = require('cheerio');

async function fetchHtml(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 4000
        });
        return response.data;
    } catch (err) {
        return null;
    }
}

function parseCodesFromHtml(html) {
    if (!html) return [];
    
    // Completely remove <img> tags before parsing text to prevent alt/src junk
    const cleanHtml = html.replace(/<img[^>]*>/gi, '');
    const $ = cheerio.load(cleanHtml);
    const extracted = [];

    // Validation filter for real promo codes
    const isValidCode = (codeStr, rewardStr) => {
        if (!codeStr || !rewardStr) return false;
        const code = codeStr.trim();
        const lowerCode = code.toLowerCase();
        
        // Reject image tags, URLs, CDNs, and non-code website text
        if (
            lowerCode.includes('imgalt') || 
            lowerCode.includes('http') || 
            lowerCode.includes('assets') || 
            lowerCode.includes('.com') || 
            lowerCode.includes('cdn') || 
            lowerCode.includes('gnw') ||
            lowerCode.includes('code') ||
            lowerCode.length < 3 || 
            lowerCode.length > 32
        ) {
            return false;
        }

        // Must match standard code characters only
        if (!/^[a-zA-Z0-9_!?-]+$/.test(code)) {
            return false;
        }

        return true;
    };

    // 1. Scrape HTML Table Rows
    $('table tr').each((i, el) => {
        const cols = $(el).find('td');
        if (cols.length >= 2) {
            const rawCode = $(cols[0]).text().trim();
            const reward = $(cols[1]).text().trim();

            if (isValidCode(rawCode, reward) && !extracted.some(item => item.code.toLowerCase() === rawCode.toLowerCase())) {
                extracted.push({ code: rawCode, reward: reward || "Active Reward" });
            }
        }
    });

    // 2. Scrape List Items & Paragraphs
    if (extracted.length === 0) {
        $('ul li, p, td, strong, code').each((i, el) => {
            const text = $(el).text().trim();
            if ((text.includes("–") || text.includes("-") || text.includes(":")) && !text.toLowerCase().includes("expired")) {
                const parts = text.split(/–|-|:/);
                if (parts[0] && parts[1]) {
                    const rawCode = parts[0].replace(/[^a-zA-Z0-9_!?-]/g, "").trim();
                    const reward = parts[1].trim();

                    if (isValidCode(rawCode, reward) && !extracted.some(item => item.code.toLowerCase() === rawCode.toLowerCase())) {
                        extracted.push({ code: rawCode, reward: reward || "Active Reward" });
                    }
                }
            }
        });
    }

    return extracted;
}

module.exports = async (req, res) => {
    const placeId = req.query.placeId;

    if (!placeId) {
        return res.status(400).json({ success: false, message: "Missing placeId parameter" });
    }

    try {
        // Fetch Game Title
        const robloxHtml = await fetchHtml(`https://www.roblox.com/games/${placeId}/`);
        if (!robloxHtml) {
            return res.status(404).json({ success: false, message: "Could not access Roblox game page." });
        }

        const $roblox = cheerio.load(robloxHtml);
        let rawName = $roblox('meta[property="og:title"]').attr('content') || $roblox('title').text();

        if (!rawName) {
            return res.status(404).json({ success: false, message: "Could not identify Roblox game title." });
        }

        // Clean out lobby words like [MAIN], Standard Lobby, [HUB], etc.
        let cleanName = rawName
            .replace(/- Roblox/i, "")
            .replace(/\[.*?\]|\(.*?\)/g, "")
            .replace(/standard lobby|lobby|hub|place/gi, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim();

        const fullSlug = cleanName.toLowerCase().replace(/\s+/g, "-");
        const shortSlug = fullSlug.replace(/^(fifa|nba|nfl|roblox)-/, "");

        const slugsToTest = [fullSlug];
        if (shortSlug !== fullSlug && shortSlug.length > 0) {
            slugsToTest.push(shortSlug);
        }

        let activeCodes = [];

        for (const slug of slugsToTest) {
            if (!slug) continue;

            const sources = [
                `https://progameguides.com/roblox/${slug}-codes/`,
                `https://robloxden.com/codes/${slug}`,
                `https://rocodes.com/codes/${slug}`,
                `https://www.vg247.com/${slug}-codes`,
                `https://beebom.com/roblox-${slug}-codes/`,
                `https://thespike.gg/roblox/${slug}-codes`
            ];

            for (const url of sources) {
                const html = await fetchHtml(url);
                const codesFound = parseCodesFromHtml(html);

                if (codesFound.length > 0) {
                    activeCodes = codesFound;
                    break;
                }
            }

            if (activeCodes.length > 0) break;
        }

        return res.status(200).json({
            success: true,
            game: cleanName || "Roblox Game",
            codes: activeCodes.length > 0 ? activeCodes : [{ code: "NO_CODES_FOUND", reward: "No active codes currently listed for this game" }]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to process request",
            error: err.message
        });
    }
};
