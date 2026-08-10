const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    const placeId = req.query.placeId;

    if (!placeId) {
        return res.status(400).json({ success: false, message: "Missing placeId parameter" });
    }

    try {
        // 1. Fetch the Roblox Game Page to get the real title
        const robloxPage = await axios.get(`https://www.roblox.com/games/${placeId}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 6000
        });

        const $roblox = cheerio.load(robloxPage.data);
        let rawName = $roblox('meta[property="og:title"]').attr('content') || $roblox('title').text();

        if (!rawName) {
            return res.status(404).json({ success: false, message: "Could not identify Roblox game title." });
        }

        // Clean game title
        let cleanName = rawName
            .replace(/- Roblox/i, "")
            .replace(/\[.*?\]|\(.*?\)/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim();

        const slug = cleanName.toLowerCase().replace(/\s+/g, "-");

        let activeCodes = [];

        // 2. Strategy A: Try ProGameGuides with expanded selectors
        try {
            const pggUrl = `https://progameguides.com/roblox/${slug}-codes/`;
            const pggRes = await axios.get(pggUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 5000
            });

            const $pgg = cheerio.load(pggRes.data);

            // Scrape list items, strong tags, and paragraph codes
            $pgg('ul li, p, td').each((i, el) => {
                const text = $pgg(el).text().trim();
                
                // Matches patterns like: CODE - Reward OR CODE – Reward
                if ((text.includes("–") || text.includes("-")) && !text.toLowerCase().includes("expired")) {
                    const parts = text.split(/–|-/);
                    if (parts[0] && parts[1]) {
                        const code = parts[0].replace(/[^a-zA-Z0-9_]/g, "").trim();
                        const reward = parts[1].trim();

                        // Validate reasonable code length
                        if (code.length >= 3 && code.length <= 30 && !activeCodes.some(c => c.code === code)) {
                            activeCodes.push({ code, reward: reward || "Active Reward" });
                        }
                    }
                }
            });
        } catch (err) {
            // ProGameGuides failed or 404'd
        }

        // 3. Strategy B: Fallback to VG247 if ProGameGuides yielded no codes
        if (activeCodes.length === 0) {
            try {
                const vgUrl = `https://www.vg247.com/${slug}-codes`;
                const vgRes = await axios.get(vgUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 5000
                });

                const $vg = cheerio.load(vgRes.data);
                $vg('ul li').each((i, el) => {
                    const text = $vg(el).text().trim();
                    if (text.includes(":") || text.includes("-")) {
                        const parts = text.split(/:|-/);
                        if (parts[0] && parts[1]) {
                            const code = parts[0].replace(/[^a-zA-Z0-9_]/g, "").trim();
                            const reward = parts[1].trim();
                            if (code.length >= 3 && code.length <= 30 && !activeCodes.some(c => c.code === code)) {
                                activeCodes.push({ code, reward });
                            }
                        }
                    }
                });
            } catch (err) {
                // Fallback failed quietly
            }
        }

        return res.status(200).json({
            success: true,
            game: cleanName,
            codes: activeCodes.length > 0 ? activeCodes : [{ code: "NO_CODES_FOUND", reward: "No active codes currently listed" }]
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to process request",
            error: err.message
        });
    }
};
