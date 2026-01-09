window.addEventListener('load', () => {
	let socket = io();
	console.log('risk-rank component loaded');

	let $rank = document.querySelector('.content .rank .value')
	let $skillPoints = document.querySelector('.content .skill-points .value')
	let $leaderboardPosition = document.querySelector('.content .leaderboard-position .value')

    socket.on('player-rank', (data) => {
        $rank.innerHTML= data.rankName;
        $skillPoints.innerHTML= data.skillPoints;
        $leaderboardPosition.innerHTML= data.leaderboardPosition;
    });
})