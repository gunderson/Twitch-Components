const _ = require('lodash');

var io;
var streamState = getInitialState();

function getInitialState() {
	return {
		twitch: {
			live: null,
			startedAt: null,
			viewers: null,
			gameName: null,
			channelStatus: null,
			title: null,
			lastEvent: null,
			raw: null
		},
		youtube: {
			live: null,
			startedAt: null,
			viewers: null,
			title: null,
			statistics: null,
			broadcast: null,
			lastEvent: null,
			raw: null
		},
		updatedAt: null
	};
}

function getPayload(eventData) {
	if (!eventData) return null;
	if (_.isObject(eventData) && 'data' in eventData) return eventData.data;
	return eventData;
}

function setTwitch(updates) {
	const base = { ...getInitialState().twitch, ...streamState.twitch };
	const next = { ...base, ...updates };
	if (!_.isEqual(streamState.twitch, next)) {
		streamState.twitch = next;
		streamState.updatedAt = new Date().toISOString();
	}
}

function setYouTube(updates) {
	const base = { ...getInitialState().youtube, ...streamState.youtube };
	const next = { ...base, ...updates };
	if (!_.isEqual(streamState.youtube, next)) {
		streamState.youtube = next;
		streamState.updatedAt = new Date().toISOString();
	}
}

function recordLastEvent(platform, name) {
	const at = new Date().toISOString();
	if (platform === 'twitch') {
		setTwitch({ lastEvent: { name, at } });
	} else {
		setYouTube({ lastEvent: { name, at } });
	}
}

function emitState() {
	if (io) {
		io.sockets.emit('stream-status.update', streamState);
	}
}

function pickStartedAt(data) {
	if (!data || typeof data !== 'object') return null;
	const keys = ['startedAt', 'started_at', 'startTime', 'start_time', 'actualStartTime'];
	for (const k of keys) {
		const v = data[k];
		if (v) {
			const t = new Date(v).getTime();
			if (!isNaN(t)) return t;
		}
	}
	return null;
}

function setupIO(externalSocket, externalio) {
	io = externalio;

	externalSocket.on('stream-status.get-state', () => {
		externalSocket.emit('stream-status.update', streamState);
	});
}

function setupStreamerbotListeners(streamerBotSocket) {
	if (!streamerBotSocket) return;
	streamState = getInitialState();

	// —— Twitch ——
	streamerBotSocket.on('Twitch.StreamOnline', (eventData) => {
		const data = getPayload(eventData);
		setTwitch({
			live: true,
			startedAt: pickStartedAt(data) || Date.now(),
			raw: data || null
		});
		recordLastEvent('twitch', 'Twitch.StreamOnline');
		emitState();
	});

	streamerBotSocket.on('Twitch.StreamOffline', (eventData) => {
		const data = getPayload(eventData);
		setTwitch({
			live: false,
			startedAt: null,
			viewers: null,
			title: null,
			channelStatus: null,
			raw: data || null
		});
		recordLastEvent('twitch', 'Twitch.StreamOffline');
		emitState();
	});

	streamerBotSocket.on('Twitch.ViewerCountUpdate', (eventData) => {
		const data = getPayload(eventData);
		const v = data && (data.viewers != null) ? data.viewers : null;
		if (v != null) {
			setTwitch({ viewers: v, raw: data || null });
		} else {
			setTwitch({ raw: data || null });
		}
		recordLastEvent('twitch', 'Twitch.ViewerCountUpdate');
		emitState();
	});

	streamerBotSocket.on('Twitch.StreamUpdate', (eventData) => {
		const data = getPayload(eventData);
		if (data && data.game) {
			setTwitch({
				gameName: data.game.name || null,
				channelStatus: data.status || null,
				raw: data
			});
		} else {
			setTwitch({ raw: data || null });
		}
		recordLastEvent('twitch', 'Twitch.StreamUpdate');
		emitState();
	});

	streamerBotSocket.on('Twitch.BroadcastUpdate', (eventData) => {
		const data = getPayload(eventData);
		if (data) {
			const title = data.title != null ? String(data.title) : null;
			setTwitch({ title, raw: data });
		} else {
			setTwitch({ raw: null });
		}
		recordLastEvent('twitch', 'Twitch.BroadcastUpdate');
		emitState();
	});

	// —— YouTube ——
	streamerBotSocket.on('YouTube.BroadcastStarted', (eventData) => {
		const data = getPayload(eventData);
		const started = pickStartedAt(data) || Date.now();
		setYouTube({
			live: true,
			startedAt: started,
			title: (data && data.title) || null,
			broadcast: data || null
		});
		recordLastEvent('youtube', 'YouTube.BroadcastStarted');
		emitState();
	});

	streamerBotSocket.on('YouTube.BroadcastEnded', (eventData) => {
		const data = getPayload(eventData);
		setYouTube({
			live: false,
			startedAt: null,
			viewers: null,
			statistics: null,
			broadcast: data || null
		});
		recordLastEvent('youtube', 'YouTube.BroadcastEnded');
		emitState();
	});

	streamerBotSocket.on('YouTube.BroadcastUpdated', (eventData) => {
		const data = getPayload(eventData);
		if (data) {
			const updates = { broadcast: data };
			if (data.title != null) updates.title = String(data.title);
			if (data.viewerCount != null) updates.viewers = data.viewerCount;
			if (data.concurrentViewers != null) updates.viewers = data.concurrentViewers;
			setYouTube(updates);
		} else {
			setYouTube({ raw: data });
		}
		recordLastEvent('youtube', 'YouTube.BroadcastUpdated');
		emitState();
	});

	streamerBotSocket.on('YouTube.StatisticsUpdated', (eventData) => {
		const data = getPayload(eventData);
		if (data) {
			const views = data.concurrentViewers != null ? data.concurrentViewers
				: (data.viewerCount != null ? data.viewerCount : null);
			setYouTube({ statistics: data, raw: data, viewers: views != null ? views : null });
		} else {
			setYouTube({ raw: data });
		}
		recordLastEvent('youtube', 'YouTube.StatisticsUpdated');
		emitState();
	});

	streamerBotSocket.on('YouTube.PresentViewers', (eventData) => {
		const data = getPayload(eventData);
		if (data) {
			const n = data.count != null ? data.count
				: (data.viewerCount != null ? data.viewerCount : (data.viewers != null ? data.viewers : null));
			if (n != null) {
				setYouTube({ viewers: n, raw: data });
			} else {
				setYouTube({ raw: data });
			}
		}
		recordLastEvent('youtube', 'YouTube.PresentViewers');
		emitState();
	});
}

module.exports = {
	setupIO,
	setupStreamerbotListeners
};
