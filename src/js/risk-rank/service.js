const socketIo = require('socket.io');
const axios = require('axios');
const cheerio = require('cheerio');

async function GetRiskRank(playername, _maxPages) {
    const baseUrl = 'https://www.hasbrorisk.com/en/leaderboard/2/1/rankPoints/';
    const maxPages = _maxPages || 100;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';

    for (let page = 1; page <= maxPages; page++) {
        const url = `${baseUrl}${page}`;
        console.log(`Fetching page ${page}: ${url}`);
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': userAgent
                }
            });

            const html = response.data;
			if (!html.includes(playername)) {
                // If playername is not found in the raw HTML, skip cheerio processing
				console.log(`couldn't find for ${playername}`);
				console.log(`
				========================================================================================
				`)
                continue; 
            }

			console.log(`Find ${playername}!`);
            const $ = cheerio.load(html);
            const rows = $('table tr');

            for (let i = 0; i < rows.length; i++) {
                const row = rows.eq(i);
                const cells = row.find('td');

                // Check if the playername is in this row
                if (new RegExp(playername, 'i').test(row.text())) {
                    // Extract the contents of each cell in the row
                    const result = [];
                    cells.each((index, cell) => {
                        result.push($(cell).text().trim());
                    });

                    return result;
                }
            }
        } catch (error) {
            console.error(`Error fetching page ${page}:`, error.message);
        }
    }

    // If playername is not found after maxPages
    return null;
}

function GetRankName(rankValue){
    let name = "";
    value = parseInt((rankValue.replace(',', '')));
    if (value >= 26000) return "Grandmaster";
    if (value >= 16000) return "Master";
    if (value >= 11000) return "Expert";
    if (value >= 6000) return "Intermediate";
    if (value >= 1000) return "Beginner";
    return "Novice";

}

// Export the function
module.exports = {GetRiskRank,GetRankName};
