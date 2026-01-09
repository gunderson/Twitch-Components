window.addEventListener('load', () => {
	console.log('risk-rank controller loaded');

	let $button = document.querySelector('button.search-player')
	let $playerName = document.querySelector('input#player-name')
	let $rank = document.querySelector('.content .rank .value')
	let $skillPoints = document.querySelector('.content .skill-points .value')
	let $leaderboardPosition = document.querySelector('.content .leaderboard-position .value')

	$button.addEventListener('click', () => {
        const playerName = $playerName.value;
        socket.emit('player-rank', playerName);
    });

    socket.on('player-rank', (data) => {
        $rank.innerHTML= data.rankName;
        $skillPoints.innerHTML= data.skillPoints;
        $leaderboardPosition.innerHTML= data.leaderboardPosition;
    });
})