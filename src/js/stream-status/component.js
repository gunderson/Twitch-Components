document.addEventListener('DOMContentLoaded', () => {
	if (typeof io === 'undefined') {
		console.error('stream-status component: socket.io not loaded');
		return;
	}
	const socket = io();
	const $root = $('.stream-status');
	const $time = $root.find('.local-clock .time');
	const $date = $root.find('.local-clock .date');
	const $zone = $root.find('.local-clock .zone');

	const $tw = $root.find('.platform.twitch');
	const $yt = $root.find('.platform.youtube');

	const timeFmt = new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
		hour12: true
	});
	const dateFmt = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	const tzName = (() => {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
		} catch (e) {
			return '';
		}
	})();

	$zone.text(tzName);

	function tickLocalClock() {
		const d = new Date();
		$time.text(timeFmt.format(d));
		$date.text(dateFmt.format(d));
	}
	tickLocalClock();
	setInterval(tickLocalClock, 500);

	function formatDuration(ms) {
		if (ms == null || !isFinite(ms) || ms < 0) {
			return '—';
		}
		const s = Math.floor(ms / 1000);
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		if (h > 0) {
			return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		}
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	function metaLineTwitch(data) {
		const parts = [data.gameName, data.channelStatus].filter(Boolean);
		return parts.length ? parts.join(' · ') : '—';
	}

	function metaLineYouTube(data) {
		const s = data.statistics;
		if (s && typeof s === 'object') {
			const bits = [
				s.concurrentViewers != null ? 'CCV ' + s.concurrentViewers : null,
				s.likeCount != null ? 'likes ' + s.likeCount : null
			].filter(Boolean);
			if (bits.length) return bits.join(' · ');
		}
		return '—';
	}

	function renderPlatform($el, data, now) {
		const isYt = $el.hasClass('youtube');
		const $live = $el.find('.live');
		if (data.live === true) {
			$live.text('Live').attr('data-live', '1');
		} else if (data.live === false) {
			$live.text('Offline').attr('data-live', '0');
		} else {
			$live.text('…').attr('data-live', '');
		}
		$el.find('.uptime').text(
			data.live && data.startedAt != null ? formatDuration(now - data.startedAt) : '—'
		);
		$el.find('.viewers').text(data.viewers != null ? String(data.viewers) : '—');
		$el.find('.title').text(data.title || '—');
		$el.find('.meta').text(isYt ? metaLineYouTube(data) : metaLineTwitch(data));
		$el.find('.last-event').text(data.lastEvent ? data.lastEvent.name : '—');
	}

	let lastState = { twitch: {}, youtube: {} };

	function rerender() {
		const now = Date.now();
		renderPlatform($tw, lastState.twitch || {}, now);
		renderPlatform($yt, lastState.youtube || {}, now);
	}

	socket.on('stream-status.update', (state) => {
		lastState = state;
		rerender();
	});
	socket.emit('stream-status.get-state');

	setInterval(rerender, 1000);
});
