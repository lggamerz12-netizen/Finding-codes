const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    const placeId = req.query.placeId;

    if (!placeId) {
        return res.status(400).json({ success: false, message: "Missing placeId parameter" });
    }

    try {
        // 1. Fetch game details using Roblox's official Games API
        const robloxRes = await axios.get(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!robloxRes.data || robloxRes.data.length === 0 || !robloxRes.data[0].name) {
            return res.status(404).json({ success: false, message: "Game not found for this PlaceId" });
        }

        const rawName = robloxRes.data[0].name;

        // Clean up title: Removes tags like [UPDATE 20], (NEW!), and special characters
        const cleanName = rawName
            .replace(/\[.*?\]|\(.*?\)/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim();

        const slug = cleanName.toLowerCase().replace(/\s+/g, "-");

        // 2. Scrape codes site with full browser headers
        const searchUrl = `https://progameguides.com/roblox/${slug}-codes/`;
        let activeCodes = [];

        try {
            const pageHtml = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
                timeout: 6000
            });

            const $ = cheerio.load(pageHtml.data);

            // 3. Extract items from active codes list
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
            // Catches missing code pages or block responses gracefully
        }

        return res.status(200).json({
            success: true,
            game: cleanName,
            codes: activeCodes.length > 0 ? activeCodes : [{ code: "NO_CODES_FOUND", reward: "No active codes currently listed" }]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error processing request",
            error: err.message
        });
    }
};
