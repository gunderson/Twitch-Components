const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.resolve(__dirname, '../../data/telestrator-settings.json');

function tlog(...args) {
	//console.log('[telestrator:server]', ...args);
}
const DEFAULT_SETTINGS = {
	color: '#ff2d55',
	thickness: 6,
	shadowWidth: 2,
	shadowBlur: 0,
	sampleRateMs: 16,
	autoClearMs: 0,
	colorChips: [
		{ id: 'default-red', color: '#ff2d55' }
	]
};

let io;
let roleBySocketId = new Map();
let hostSocketId = null;
let streamSessionId = 0;
let strokes = [];
let settings = loadSettings();
let autoClearTimer = null;
let saveDebounce = null;

function summarizePresence() {
	const roles = { host: 0, drawer: 0, display: 0, viewer: 0 };
	for (const role of roleBySocketId.values()) {
		if (roles[role] == null) roles.viewer += 1;
		else roles[role] += 1;
	}
	return {
		hostSocketId,
		counts: roles
	};
}

function loadSettings() {
	try {
		if (!fs.existsSync(SETTINGS_PATH)) return normalizeSettings({ ...DEFAULT_SETTINGS });
		const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		return normalizeSettings({
			...DEFAULT_SETTINGS,
			...parsed
		});
	} catch (error) {
		console.error('Failed to load telestrator settings', error.message);
		return normalizeSettings({ ...DEFAULT_SETTINGS });
	}
}

function saveSettingsDebounced() {
	clearTimeout(saveDebounce);
	saveDebounce = setTimeout(() => {
		try {
			fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
		} catch (error) {
			console.error('Failed to save telestrator settings', error.message);
		}
	}, 250);
}

function getState() {
	return {
		session: {
			hostSocketId,
			streamSessionId
		},
		settings,
		strokes
	};
}

function emitState(targetSocket) {
	if (targetSocket) {
		targetSocket.emit('telestrator.state', getState());
		return;
	}
	if (io) {
		io.sockets.emit('telestrator.state', getState());
	}
}

function emitPresence() {
	if (!io) return;
	io.sockets.emit('telestrator.presence', summarizePresence());
}

function resetAutoClearTimer() {
	clearTimeout(autoClearTimer);
	autoClearTimer = null;
	if (!settings.autoClearMs || settings.autoClearMs <= 0) return;
	autoClearTimer = setTimeout(() => {
		strokes = [];
		tlog('line clear: timeout, broadcasting telestrator.clear');
		if (io) io.sockets.emit('telestrator.clear', { source: 'timeout' });
	}, settings.autoClearMs);
}

function updateSettings(nextPartial) {
	const normalized = normalizeSettings({
		...settings,
		...nextPartial
	});
	settings = {
		...settings,
		...normalized
	};
	saveSettingsDebounced();
	if (io) {
		io.sockets.emit('telestrator.settings', settings);
	}
	resetAutoClearTimer();
}

function normalizeSettings(input) {
	const safe = { ...input };
	safe.color = normalizeHexColor(safe.color || DEFAULT_SETTINGS.color);
	safe.thickness = Math.max(1, Math.min(60, Number(safe.thickness) || DEFAULT_SETTINGS.thickness));
	// Legacy migration: boolean shadowEnabled -> numeric shadowWidth.
	const legacyShadowWidth = safe.shadowEnabled ? DEFAULT_SETTINGS.shadowWidth : 0;
	safe.shadowWidth = Math.max(0, Math.min(80, Number(safe.shadowWidth)));
	if (Number.isNaN(safe.shadowWidth)) safe.shadowWidth = legacyShadowWidth;
	safe.shadowBlur = Math.max(0, Math.min(60, Number(safe.shadowBlur) || DEFAULT_SETTINGS.shadowBlur));
	safe.sampleRateMs = Math.max(1, Math.min(200, Number(safe.sampleRateMs) || DEFAULT_SETTINGS.sampleRateMs));
	safe.autoClearMs = Math.max(0, Number(safe.autoClearMs) || 0);
	const chips = Array.isArray(safe.colorChips) ? safe.colorChips : [];
	safe.colorChips = chips
		.map((chip) => ({
			id: chip && chip.id ? String(chip.id) : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			color: normalizeHexColor(chip && chip.color ? chip.color : safe.color)
		}))
		.filter((chip, idx, arr) => chip.id && arr.findIndex((c) => c.id === chip.id) === idx)
		.slice(0, 128);
	return safe;
}

function normalizeHexColor(value) {
	const hex = String(value || '').trim().replace('#', '');
	if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
	if (/^[0-9a-fA-F]{3}$/.test(hex)) {
		const expanded = hex.split('').map((c) => `${c}${c}`).join('');
		return `#${expanded.toLowerCase()}`;
	}
	return DEFAULT_SETTINGS.color;
}

function setupIO(socket, externalIo) {
	io = externalIo;

	socket.on('telestrator.register', ({ role }) => {
		const nextRole = role || 'viewer';
		roleBySocketId.set(socket.id, nextRole);
		if (nextRole === 'host') {
			hostSocketId = socket.id;
			streamSessionId += 1;
			strokes = [];
		}

		socket.emit('telestrator.registered', {
			role: nextRole,
			hostSocketId,
			streamSessionId
		});
		emitState(socket);
		emitPresence();
	});

	socket.on('telestrator.get-state', () => {
		emitState(socket);
	});

	socket.on('telestrator.set-settings', (partial = {}) => {
		updateSettings(partial);
		emitState();
	});

	socket.on('telestrator.clear', () => {
		const role = roleBySocketId.get(socket.id) || 'unknown';
		tlog('line clear: received from client', { socket: socket.id, role });
		strokes = [];
		resetAutoClearTimer();
		tlog('line clear: broadcasting telestrator.clear (manual)');
		if (io) io.sockets.emit('telestrator.clear', { source: 'manual' });
	});

	socket.on('telestrator.stroke.append', (stroke) => {
		if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
		const role = roleBySocketId.get(socket.id) || 'unknown';
		const idIn = stroke.id;
		const pointCount = stroke.points.length;
		tlog('line event: received telestrator.stroke.append', { socket: socket.id, role, idIn, pointCount });
		const newId = stroke.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		const baseStyle = {
			color: settings.color,
			thickness: settings.thickness,
			shadowWidth: settings.shadowWidth
		};
		const strokeStyle = stroke.style || {};
		baseStyle.color = normalizeHexColor(strokeStyle.color || baseStyle.color);
		baseStyle.thickness = Math.max(1, Math.min(60, Number(strokeStyle.thickness) || baseStyle.thickness));
		baseStyle.shadowWidth = Math.max(0, Math.min(80, Number(strokeStyle.shadowWidth)));
		if (Number.isNaN(baseStyle.shadowWidth)) baseStyle.shadowWidth = settings.shadowWidth;
		const idx = strokes.findIndex((s) => s && s.id === newId);
		let out;
		if (idx >= 0) {
			const prev = strokes[idx];
			out = {
				...prev,
				style: { ...prev.style, ...baseStyle },
				points: stroke.points
			};
			strokes[idx] = out;
			tlog('line event: upsert (update) telestrator.stroke.append', { id: newId, pointCount: out.points.length });
		} else {
			out = {
				id: newId,
				createdBy: socket.id,
				createdAt: Date.now(),
				style: baseStyle,
				points: stroke.points
			};
			strokes.push(out);
			tlog('line event: upsert (new) telestrator.stroke.append', { id: out.id, pointCount: out.points.length, totalStrokes: strokes.length });
		}
		if (io) io.sockets.emit('telestrator.stroke.append', out);
		resetAutoClearTimer();
	});

	socket.on('telestrator.webrtc.offer', (payload = {}) => {
		if (!payload.to) return;
		io.to(payload.to).emit('telestrator.webrtc.offer', {
			from: socket.id,
			sdp: payload.sdp
		});
	});

	socket.on('telestrator.webrtc.request-offer', (payload = {}) => {
		if (!hostSocketId) return;
		io.to(hostSocketId).emit('telestrator.webrtc.request-offer', {
			from: socket.id,
			meta: payload.meta || {}
		});
	});

	socket.on('telestrator.webrtc.answer', (payload = {}) => {
		if (!payload.to) return;
		io.to(payload.to).emit('telestrator.webrtc.answer', {
			from: socket.id,
			sdp: payload.sdp
		});
	});

	socket.on('telestrator.webrtc.ice', (payload = {}) => {
		if (!payload.to) return;
		io.to(payload.to).emit('telestrator.webrtc.ice', {
			from: socket.id,
			candidate: payload.candidate
		});
	});

	socket.on('disconnect', () => {
		const role = roleBySocketId.get(socket.id);
		roleBySocketId.delete(socket.id);
		if (role === 'host' && hostSocketId === socket.id) {
			hostSocketId = null;
			streamSessionId += 1;
			strokes = [];
			if (io) io.sockets.emit('telestrator.host-offline');
			emitState();
		}
		emitPresence();
	});
}

module.exports = {
	setupIO
};
