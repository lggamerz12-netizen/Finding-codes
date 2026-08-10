const axios = require('axios');
const cheerio = require('cheerio');

// Helper to make fast HTTP requests with standard headers
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

// Helper to extract code-like patterns (CODE - REWARD)
function parseCodesFromHtml(html) {
    if (!html) return [];
    const $ = cheerio.load(html);
    const extracted = [];

    $('ul li, table tr, p, td').each((i, el) => {
        const text = $(el).text().trim();
        if ((text.includes("–") || text.includes("-") || text.includes(":")) && !text.toLowerCase().includes("expired")) {
            const parts = text.split(/–|-|:/);
            if (parts[0] && parts[1]) {
                const code = parts[0].replace(/[^a-zA-Z0-9_]/g, "").trim();
                const reward = parts[1].trim();

                if (code.length >= 3 && code.length <= 32 && !extracted.some(item => item.code === code)) {
                    extracted.push({ code, reward: reward || "Active Reward" });
                }
            }
        }
    });

    return extracted;
}

module.exports = async (req, res) => {
    const placeId = req.query.placeId;

    if (!placeId) {
        return res.status(400).json({ success: false, message: "Missing placeId parameter" });
    }

    try {
        // 1. Get Game Title from Roblox
        const robloxHtml = await fetchHtml(`https://www.roblox.com/games/${placeId}/`);
        if (!robloxHtml) {
            return res.status(404).json({ success: false, message: "Could not access Roblox game page." });
        }

        const $roblox = cheerio.load(robloxHtml);
        let rawName = $roblox('meta[property="og:title"]').attr('content') || $roblox('title').text();

        if (!rawName) {
            return res.status(404).json({ success: false, message: "Could not identify Roblox game title." });
        }

        const cleanName = rawName
            .replace(/- Roblox/i, "")
            .replace(/\[.*?\]|\(.*?\)/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim();

        const slug = cleanName.toLowerCase().replace(/\s+/g, "-");

        // 2. Sources configuration list
        const sources = [
            `https://progameguides.com/roblox/${slug}-codes/`,
            `https://www.vg247.com/${slug}-codes`,
            `https://robloxden.com/codes/${slug}`,
            `https://rocodes.com/codes/${slug}`,
            `https://beebom.com/roblox-${slug}-codes/`,
            `https://thespike.gg/roblox/${slug}-codes`
        ];

        let activeCodes = [];

        // 3. Try each source sequentially until codes are found
        for (const url of sources) {
            const html = await fetchHtml(url);
            const codesFound = parseCodesFromHtml(html);

            if (codesFound.length > 0) {
                activeCodes = codesFound;
                break; // Stop checking as soon as a source returns valid codes
            }
        }

        return res.status(200).json({
            success: true,
            game: cleanName,
            codes: activeCodes.length > 0 ? activeCodes : [{ code: "NO_CODES_FOUND", reward: "No active codes found on supported sites" }]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to process request",
            error: err.message
        });
    }
};
