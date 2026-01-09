window.addEventListener('DOMContentLoaded', () => {
	
	let $twFollowButton = $('button#tw-follow')

	$twFollowButton.on('click', () => {
		socket.emit('screen-alerts.sim-tw-follow')
	});
})