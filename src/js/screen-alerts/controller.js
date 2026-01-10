window.addEventListener('DOMContentLoaded', () => {
	// Wire up all simulation buttons
	$('button#tw-follow').on('click', () => {
		socket.emit('screen-alerts.sim-tw-follow');
	});
	
	$('button#tw-sub').on('click', () => {
		socket.emit('screen-alerts.sim-tw-sub');
	});
	
	$('button#tw-gift-sub').on('click', () => {
		socket.emit('screen-alerts.sim-tw-gift-sub');
	});
	
	$('button#tw-gift-sub-multi').on('click', () => {
		socket.emit('screen-alerts.sim-tw-gift-sub-multi');
	});
	
	$('button#tw-bits').on('click', () => {
		socket.emit('screen-alerts.sim-tw-bits');
	});
	
	$('button#yt-sub').on('click', () => {
		socket.emit('screen-alerts.sim-yt-sub');
	});
	
	$('button#yt-member').on('click', () => {
		socket.emit('screen-alerts.sim-yt-member');
	});
	
	$('button#yt-superchat').on('click', () => {
		socket.emit('screen-alerts.sim-yt-superchat');
	});
	
	$('button#yt-donation').on('click', () => {
		socket.emit('screen-alerts.sim-yt-donation');
	});
	
	// Listen for queue updates
	socket.on('screen-alerts.queue-update', updateQueueDisplay);
	
	// Request initial queue state
	socket.emit('screen-alerts.get-queue');
});

function updateQueueDisplay(queue) {
	const $queueList = $('#alert-queue-list');
	if (!$queueList.length) return;
	
	$queueList.empty();
	
	if (queue.length === 0) {
		$queueList.append('<li class="empty">No alerts queued</li>');
		return;
	}
	
	queue.forEach((alert, index) => {
		const platform = alert.platform || 'Unknown';
		const type = alert.type || 'unknown';
		const username = alert.username || 'Anonymous';
		const platformClass = platform.toLowerCase() === 'twitch' ? 'tw' : platform.toLowerCase() === 'youtube' ? 'yt' : '';
		const $item = $('<li>')
			.addClass('queue-item')
			.html(`
				<span class="queue-index">${index + 1}</span>
				<span class="queue-platform ${platformClass}">${platform}</span>
				<span class="queue-type">${type}</span>
				<span class="queue-username">${username}</span>
			`);
		$queueList.append($item);
	});
}