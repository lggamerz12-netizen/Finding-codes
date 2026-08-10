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
    
    // Remove images to prevent junk ALT text
    const cleanHtml = html.replace(/<img[^>]*>/gi, '');
    const $ = cheerio.load(cleanHtml);
    const extracted = [];

    const isValidCode = (codeStr) => {
        if (!codeStr) return false;
        const code = codeStr.trim();
        const lowerCode = code.toLowerCase();
        
        if (
            lowerCode.includes('imgalt') || 
            lowerCode.includes('http') || 
            lowerCode.includes('assets') || 
            lowerCode.includes('.com') || 
            lowerCode.includes('cdn') || 
            lowerCode.includes('code') ||
            lowerCode.length < 3 || 
            lowerCode.length > 32
        ) {
            return false;
        }

        return /^[a-zA-Z0-9_!?-]+$/.test(code);
    };

    const cleanReward = (rewardStr) => {
        if (!rewardStr) return "Free In-Game Reward";
        let clean = rewardStr.trim();
        // Remove common trailing junk or long fluff
        clean = clean.replace(/^[–\-:\s]+/, "").trim();
        if (clean.length === 0 || clean.length > 60 || clean.toLowerCase().includes("http")) {
            return "Free In-Game Reward";
        }
        return clean;
    };

    let stopScraping = false;

    // Scan element by element to detect "Expired" sections
    $('h2, h3, h4, table, ul').each((i, el) => {
        if (stopScraping) return;

        const tag = el.name;
        const text = $(el).text().toLowerCase();

        // Halt parsing as soon as we reach expired section headings
        if (['h2', 'h3', 'h4'].includes(tag)) {
            if (text.includes("expired") || text.includes("inactive") || text.includes("outdated") || text.includes("past code")) {
                stopScraping = true;
                return;
            }
        }

        // Process active tables
        if (tag === 'table') {
            $(el).find('tr').each((_, tr) => {
                const cols = $(tr).find('td');
                if (cols.length >= 2) {
                    const rawCode = $(cols[0]).text().trim();
                    const rawReward = $(cols[1]).text().trim();

                    if (isValidCode(rawCode) && !extracted.some(item => item.code.toLowerCase() === rawCode.toLowerCase())) {
                        extracted.push({ code: rawCode, reward: cleanReward(rawReward) });
                    }
                }
            });
        }

        // Process active lists
        if (tag === 'ul') {
            $(el).find('li').each((_, li) => {
                const liText = $(li).text().trim();
                if ((liText.includes("–") || liText.includes("-") || liText.includes(":")) && !liText.toLowerCase().includes("expired")) {
                    const parts = liText.split(/–|-|:/);
                    if (parts[0] && parts[1]) {
                        const rawCode = parts[0].replace(/[^a-zA-Z0-9_!?-]/g, "").trim();
                        const rawReward = parts.slice(1).join("-").trim();

                        if (isValidCode(rawCode) && !extracted.some(item => item.code.toLowerCase() === rawCode.toLowerCase())) {
                            extracted.push({ code: rawCode, reward: cleanReward(rawReward) });
                        }
                    }
                }
            });
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
        const robloxHtml = await fetchHtml(`https://www.roblox.com/games/${placeId}/`);
        if (!robloxHtml) {
            return res.status(404).json({ success: false, message: "Could not access Roblox game page." });
        }

        const $roblox = cheerio.load(robloxHtml);
        let rawName = $roblox('meta[property="og:title"]').attr('content') || $roblox('title').text();

        if (!rawName) {
            return res.status(404).json({ success: false, message: "Could not identify Roblox game title." });
        }

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
