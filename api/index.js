const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    const placeId = req.query.placeId;

    if (!placeId) {
        return res.status(400).json({ success: false, message: "Missing placeId parameter" });
    }

    try {
        // 1. Get Game Details from Roblox
        const robloxRes = await axios.get(`https://economy.roblox.com/v2/assets/${placeId}/details`);
        const rawName = robloxRes.data.Name || "";
        
        const gameName = rawName.replace(/[^a-zA-Z0-9 ]/g, "").trim();
        const slug = gameName.toLowerCase().replace(/\s+/g, "-");

        // 2. Scrape codes site
        const searchUrl = `https://progameguides.com/roblox/${slug}-codes/`;
        const pageHtml = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const $ = cheerio.load(pageHtml.data);
        const activeCodes = [];

        // 3. Extract items from active codes list
        $('ul li').each((i, el) => {
            const text = $(el).text();
            if (text.includes("–") || text.includes("-")) {
                const parts = text.split(/–|-/);
                activeCodes.push({
                    code: parts[0].trim(),
                    reward: parts[1] ? parts[1].trim() : "Active Reward"
                });
            }
        });

        return res.status(200).json({
            success: true,
            game: gameName,
            codes: activeCodes
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Could not automatically fetch codes for this PlaceId."
        });
    }
};
