const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    const placeId = req.query.placeId;

    if (!placeId) {
        return res.status(400).json({ success: false, message: "Missing placeId parameter" });
    }

    try {
        // 1. Fetch the Roblox Game Page directly
        const robloxPage = await axios.get(`https://www.roblox.com/games/${placeId}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            maxRedirects: 5,
            timeout: 6000
        });

        const $roblox = cheerio.load(robloxPage.data);
        
        // Extract game title from OpenGraph metadata or page title
        let rawName = $roblox('meta[property="og:title"]').attr('content') || $roblox('title').text();

        if (!rawName) {
            return res.status(404).json({ success: false, message: "Could not identify Roblox game title." });
        }

        // Clean game title: removes "- Roblox", [UPDATE 20], (NEW!), and special characters
        let cleanName = rawName
            .replace(/- Roblox/i, "")
            .replace(/\[.*?\]|\(.*?\)/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim();

        const slug = cleanName.toLowerCase().replace(/\s+/g, "-");

        // 2. Scrape Pro Game Guides for Codes
        const searchUrl = `https://progameguides.com/roblox/${slug}-codes/`;
        let activeCodes = [];

        try {
            const pageHtml = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 5000
            });

            const $codes = cheerio.load(pageHtml.data);

            $codes('ul li').each((i, el) => {
                const text = $codes(el).text();
                if (text.includes("–") || text.includes("-")) {
                    const parts = text.split(/–|-/);
                    if (parts[0] && parts[1]) {
                        const code = parts[0].trim();
                        const reward = parts[1].trim();
                        if (code.length > 0 && code.length < 35) {
                            activeCodes.push({ code, reward });
                        }
                    }
                }
            });
        } catch (scrapeErr) {
            // Gracefully handles games without dedicated code pages
        }

        return res.status(200).json({
            success: true,
            game: cleanName,
            codes: activeCodes.length > 0 ? activeCodes : [{ code: "NO_CODES_FOUND", reward: "No active codes currently listed" }]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to load Roblox game page",
            error: err.message
        });
    }
};
