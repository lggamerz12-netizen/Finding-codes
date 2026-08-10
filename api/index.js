const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    const placeId = req.query.placeId;

    if (!placeId) {
        return res.status(400).json({ success: false, message: "Missing placeId parameter" });
    }

    try {
        // 1. Fetch game details using RoProxy (Public Roblox API Proxy)
        const robloxRes = await axios.get(`https://apis.roproxy.com/universes/v1/places/${placeId}/universe-details`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!robloxRes.data || !robloxRes.data.name) {
            return res.status(404).json({ success: false, message: "Game details not found" });
        }

        const rawName = robloxRes.data.name;

        // Clean game title: Removes tags like [UPDATE 20] or (NEW!)
        const cleanName = rawName
            .replace(/\[.*?\]|\(.*?\)/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim();

        const slug = cleanName.toLowerCase().replace(/\s+/g, "-");

        // 2. Scrape codes site
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

            const $ = cheerio.load(pageHtml.data);

            $('ul li').each((i, el) => {
                const text = $(el).text();
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
            // Catches missing code pages gracefully
        }

        return res.status(200).json({
            success: true,
            game: cleanName,
            codes: activeCodes.length > 0 ? activeCodes : [{ code: "NO_CODES_FOUND", reward: "No active codes currently listed" }]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch Roblox game info",
            error: err.message
        });
    }
};
