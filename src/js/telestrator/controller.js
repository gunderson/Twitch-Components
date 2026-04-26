window.addEventListener('DOMContentLoaded', () => {
	if (typeof io === 'undefined') return;
	// console.log('[telestrator:controller] page loaded');
	const socket = io();
	const pcByPeerId = new Map();
	let localStream = null;
	let currentSettings = {
		color: '#ff2d55',
		thickness: 6,
		shadowWidth: 2,
		shadowBlur: 0,
		sampleRateMs: 16,
		autoClearMs: 0,
		colorChips: [{ id: 'default-red', color: '#ff2d55' }]
	};
	let editingChipId = null;

	const $root = $('.telestrator.controller');
	const $start = $root.find('.start-capture');
	const $stop = $root.find('.stop-capture');
	const $clear = $root.find('.clear-lines');
	const $fullscreen = $root.find('.fullscreen');
	const $menu = $root.find('.menu');
	const $hostState = $root.find('.host-state');
	const $presence = $root.find('.presence');

	const $chipGrid = $root.find('.chip-grid');
	const $chipSubmenu = $root.find('.chip-submenu');
	const $closeChipSubmenu = $root.find('.close-chip-submenu');
	const $chipHex = $root.find('.chip-hex');
	const $chipPreview = $root.find('.chip-preview');
	const $chipHue = $root.find('.chip-hue');
	const $chipSaturation = $root.find('.chip-saturation');
	const $chipBrightness = $root.find('.chip-brightness');
	const $chipHueValue = $root.find('.chip-hue-value');
	const $chipSaturationValue = $root.find('.chip-saturation-value');
	const $chipBrightnessValue = $root.find('.chip-brightness-value');
	const $spotPickColor = $root.find('.spot-pick-color');
	const $saveChip = $root.find('.save-chip');
	const $deleteChip = $root.find('.delete-chip');
	const $thickness = $root.find('.line-thickness');
	const $thicknessValue = $root.find('.line-thickness-value');
	const $shadowWidth = $root.find('.shadow-width');
	const $shadowWidthValue = $root.find('.shadow-width-value');
	const $shadowBlur = $root.find('.shadow-blur');
	const $shadowBlurValue = $root.find('.shadow-blur-value');
	const $sampleRate = $root.find('.sample-rate');
	const $sampleRateValue = $root.find('.sample-rate-value');
	const $autoClear = $root.find('.auto-clear');
	const $autoClearValue = $root.find('.auto-clear-value');
	let isMainMenuOpen = true;
	let isChipSubmenuOpen = false;
	let chipHoldTimer = null;
	let chipHoverTimer = null;
	const LONG_PRESS_MS = 550;

	socket.emit('telestrator.register', { role: 'host' });
	socket.emit('telestrator.get-state');

	function syncSettingsUI() {
		$thickness.val(currentSettings.thickness);
		$thicknessValue.text(String(currentSettings.thickness));
		$shadowWidth.val(Math.max(0, Number(currentSettings.shadowWidth) || 0));
		$shadowWidthValue.text(String(Math.max(0, Number(currentSettings.shadowWidth) || 0)));
		$shadowBlur.val(Math.max(0, Number(currentSettings.shadowBlur) || 0));
		$shadowBlurValue.text(String(Math.max(0, Number(currentSettings.shadowBlur) || 0)));
		$sampleRate.val(currentSettings.sampleRateMs);
		$sampleRateValue.text(String(currentSettings.sampleRateMs));
		$autoClear.val(Math.max(0, Number(currentSettings.autoClearMs) || 0));
		$autoClearValue.text(String(Math.max(0, Number(currentSettings.autoClearMs) || 0)));
		renderChips();
		setEditorColor(currentSettings.color);
	}

	function sendSettings() {
		socket.emit('telestrator.set-settings', currentSettings);
	}

	function bindSettingsHandlers() {
		$thickness.on('input', () => {
			currentSettings.thickness = Number($thickness.val()) || 6;
			$thicknessValue.text(String(currentSettings.thickness));
			sendSettings();
		});
		$shadowWidth.on('input', () => {
			currentSettings.shadowWidth = Math.max(0, Number($shadowWidth.val()) || 0);
			$shadowWidthValue.text(String(currentSettings.shadowWidth));
			sendSettings();
		});
		$shadowBlur.on('input', () => {
			currentSettings.shadowBlur = Math.max(0, Number($shadowBlur.val()) || 0);
			$shadowBlurValue.text(String(currentSettings.shadowBlur));
			sendSettings();
		});
		$sampleRate.on('input', () => {
			currentSettings.sampleRateMs = Number($sampleRate.val()) || 16;
			$sampleRateValue.text(String(currentSettings.sampleRateMs));
			sendSettings();
		});
		$autoClear.on('input change', () => {
			currentSettings.autoClearMs = Math.max(0, Number($autoClear.val()) || 0);
			$autoClearValue.text(String(currentSettings.autoClearMs));
			sendSettings();
		});
	}

	function resetSubmenus() {
		isChipSubmenuOpen = false;
		$chipSubmenu.removeClass('open');
	}

	function openMainMenu() {
		isMainMenuOpen = true;
		$menu.removeClass('hidden');
		resetSubmenus();
	}

	function closeMainMenu() {
		isMainMenuOpen = false;
		$menu.addClass('hidden');
		resetSubmenus();
	}

	function toggleMainMenu() {
		if (isMainMenuOpen) closeMainMenu();
		else openMainMenu();
	}

	function openChipSubmenu(chip) {
		if (chip) {
			editingChipId = chip.id || null;
			setEditorColor(chip.color || currentSettings.color);
		}
		isChipSubmenuOpen = true;
		$chipSubmenu.addClass('open');
	}

	function closeChipSubmenu() {
		isChipSubmenuOpen = false;
		$chipSubmenu.removeClass('open');
	}

	function normalizeHex(value) {
		const raw = String(value || '').trim().replace('#', '');
		if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
		if (/^[0-9a-fA-F]{3}$/.test(raw)) {
			return `#${raw.split('').map((c) => `${c}${c}`).join('').toLowerCase()}`;
		}
		return null;
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}

	function hexToHsb(hex) {
		const normalized = normalizeHex(hex);
		if (!normalized) return { h: 0, s: 0, b: 0 };
		const num = Number.parseInt(normalized.slice(1), 16);
		const r = ((num >> 16) & 255) / 255;
		const g = ((num >> 8) & 255) / 255;
		const b = (num & 255) / 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const delta = max - min;
		let hue = 0;
		if (delta > 0) {
			if (max === r) hue = ((g - b) / delta) % 6;
			else if (max === g) hue = (b - r) / delta + 2;
			else hue = (r - g) / delta + 4;
			hue *= 60;
			if (hue < 0) hue += 360;
		}
		const saturation = max === 0 ? 0 : delta / max;
		return {
			h: Math.round(hue),
			s: Math.round(saturation * 100),
			b: Math.round(max * 100)
		};
	}

	function hsbToHex(h, s, b) {
		const hue = ((Number(h) % 360) + 360) % 360;
		const sat = clamp(Number(s) / 100, 0, 1);
		const bri = clamp(Number(b) / 100, 0, 1);
		const chroma = bri * sat;
		const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
		const m = bri - chroma;
		let r1 = 0;
		let g1 = 0;
		let b1 = 0;
		if (hue < 60) [r1, g1, b1] = [chroma, x, 0];
		else if (hue < 120) [r1, g1, b1] = [x, chroma, 0];
		else if (hue < 180) [r1, g1, b1] = [0, chroma, x];
		else if (hue < 240) [r1, g1, b1] = [0, x, chroma];
		else if (hue < 300) [r1, g1, b1] = [x, 0, chroma];
		else [r1, g1, b1] = [chroma, 0, x];
		const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
		return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
	}

	function setHSBUI(hsb) {
		$chipHue.val(hsb.h);
		$chipSaturation.val(hsb.s);
		$chipBrightness.val(hsb.b);
		$chipHueValue.text(String(hsb.h));
		$chipSaturationValue.text(`${hsb.s}%`);
		$chipBrightnessValue.text(`${hsb.b}%`);
	}

	function setEditorColor(hex) {
		const valid = normalizeHex(hex) || currentSettings.color;
		$chipHex.val(valid);
		$chipPreview.css('background', valid);
		setHSBUI(hexToHsb(valid));
	}

	function renderChips() {
		const chips = Array.isArray(currentSettings.colorChips) ? currentSettings.colorChips : [];
		$chipGrid.empty();
		chips.forEach((chip) => {
			const $btn = $('<button type="button" class="chip"></button>');
			$btn.attr('data-chip-id', chip.id);
			$btn.css('background', chip.color);
			if (chip.color === currentSettings.color) $btn.addClass('selected');
			$chipGrid.append($btn);
		});
		const $blank = $('<button type="button" class="chip blank">+</button>');
		$blank.addClass('blank');
		$blank.attr('data-chip-id', '__new__');
		$chipGrid.append($blank);
	}

	function saveChip() {
		const color = normalizeHex($chipHex.val());
		if (!color) return;
		const chips = Array.isArray(currentSettings.colorChips) ? [...currentSettings.colorChips] : [];
		if (editingChipId) {
			const idx = chips.findIndex((c) => c.id === editingChipId);
			if (idx >= 0) chips[idx] = { ...chips[idx], color };
			else chips.push({ id: editingChipId, color });
		} else {
			editingChipId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
			chips.push({ id: editingChipId, color });
		}
		currentSettings.color = color;
		currentSettings.colorChips = chips;
		sendSettings();
		syncSettingsUI();
		closeChipSubmenu();
	}

	function deleteChip() {
		if (!editingChipId) return;
		currentSettings.colorChips = (currentSettings.colorChips || []).filter((c) => c.id !== editingChipId);
		editingChipId = null;
		sendSettings();
		syncSettingsUI();
		closeChipSubmenu();
	}

	async function startCapture() {
		try {
			const targetWidth = Math.max(320, Math.floor((window.screen.width || 1280) / 2));
			const targetHeight = Math.max(180, Math.floor((window.screen.height || 720) / 2));
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					cursor: 'never',
					frameRate: { ideal: 15, max: 15 },
					width: { ideal: targetWidth, max: targetWidth },
					height: { ideal: targetHeight, max: targetHeight }
				},
				audio: false
			});
			const videoTrack = stream.getVideoTracks()[0];
			if (videoTrack && videoTrack.applyConstraints) {
				await videoTrack.applyConstraints({
					frameRate: 15,
					width: targetWidth,
					height: targetHeight
				});
			}
			localStream = stream;
			$hostState.text('capturing');
			videoTrack.addEventListener('ended', () => {
				stopCapture();
			});
			for (const peerId of pcByPeerId.keys()) {
				await renegotiatePeer(peerId);
			}
		} catch (err) {
			console.error('Capture failed', err);
		}
	}

	function stopCapture() {
		if (localStream) {
			localStream.getTracks().forEach((t) => t.stop());
			localStream = null;
		}
		$hostState.text('offline');
	}

	function ensurePeerConnection(peerId) {
		if (pcByPeerId.has(peerId)) return pcByPeerId.get(peerId);
		const pc = new RTCPeerConnection({
			iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
		});
		pc.onicecandidate = (event) => {
			if (event.candidate) {
				socket.emit('telestrator.webrtc.ice', {
					to: peerId,
					candidate: event.candidate
				});
			}
		};
		pc.onconnectionstatechange = () => {
			if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
				pcByPeerId.delete(peerId);
				try { pc.close(); } catch (_) {}
			}
		};
		pcByPeerId.set(peerId, pc);
		return pc;
	}

	async function renegotiatePeer(peerId) {
		const pc = ensurePeerConnection(peerId);
		const existingSenders = pc.getSenders().filter((s) => s.track && s.track.kind === 'video');
		existingSenders.forEach((sender) => pc.removeTrack(sender));
		if (localStream) {
			localStream.getVideoTracks().forEach((track) => {
				pc.addTrack(track, localStream);
			});
		}
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		socket.emit('telestrator.webrtc.offer', {
			to: peerId,
			sdp: pc.localDescription
		});
	}

	socket.on('telestrator.state', (state) => {
		if (state && state.strokes) {
			// console.log('[telestrator:controller] received telestrator.state', { strokeCount: state.strokes.length });
		}
		if (state && state.settings) {
			currentSettings = { ...currentSettings, ...state.settings };
			syncSettingsUI();
		}
	});

	socket.on('telestrator.settings', (nextSettings) => {
		currentSettings = { ...currentSettings, ...nextSettings };
		syncSettingsUI();
	});

	socket.on('telestrator.stroke.append', (stroke) => {
		if (!stroke) return;
		// console.log('[telestrator:controller] received telestrator.stroke.append', {
		// 	id: stroke.id,
		// 	pointCount: stroke.points ? stroke.points.length : 0
		// });
	});

	socket.on('telestrator.clear', (payload) => {
		// console.log('[telestrator:controller] received telestrator.clear', payload || {});
	});

	socket.on('telestrator.presence', (presence) => {
		if (!presence || !presence.counts) return;
		$presence.text(`drawer ${presence.counts.drawer}, display ${presence.counts.display}`);
	});

	socket.on('telestrator.webrtc.request-offer', async (payload) => {
		if (!payload || !payload.from) return;
		await renegotiatePeer(payload.from);
	});

	socket.on('telestrator.webrtc.answer', async (payload) => {
		if (!payload || !payload.from || !payload.sdp) return;
		const pc = ensurePeerConnection(payload.from);
		await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
	});

	socket.on('telestrator.webrtc.ice', async (payload) => {
		if (!payload || !payload.from || !payload.candidate) return;
		const pc = ensurePeerConnection(payload.from);
		try {
			await pc.addIceCandidate(payload.candidate);
		} catch (err) {
			console.warn('ICE add failed', err);
		}
	});

	$start.on('click', startCapture);
	$stop.on('click', stopCapture);
	$clear.on('click', () => {
		// console.log('[telestrator:controller] sending telestrator.clear');
		socket.emit('telestrator.clear');
	});
	$fullscreen.on('click', async () => {
		try {
			if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
			else await document.exitFullscreen();
		} catch (err) {
			console.warn('fullscreen failed', err);
		}
	});
	$chipGrid.on('click', '.chip', (event) => {
		const chipId = $(event.currentTarget).attr('data-chip-id');
		if (chipId === '__new__') {
			editingChipId = null;
			setEditorColor(currentSettings.color);
			openChipSubmenu({ id: null, color: currentSettings.color });
			return;
		}
		const chip = (currentSettings.colorChips || []).find((c) => c.id === chipId);
		if (!chip) return;
		currentSettings.color = chip.color;
		sendSettings();
		syncSettingsUI();
	});
	$chipGrid.on('pointerdown', '.chip', (event) => {
		const chipId = $(event.currentTarget).attr('data-chip-id');
		if (chipId === '__new__') return;
		clearTimeout(chipHoldTimer);
		chipHoldTimer = setTimeout(() => {
			const chip = (currentSettings.colorChips || []).find((c) => c.id === chipId);
			if (!chip) return;
			openChipSubmenu(chip);
		}, LONG_PRESS_MS);
	});
	$chipGrid.on('pointerup pointercancel pointerleave', '.chip', () => {
		clearTimeout(chipHoldTimer);
	});
	$chipGrid.on('mouseenter', '.chip', (event) => {
		const chipId = $(event.currentTarget).attr('data-chip-id');
		if (chipId === '__new__') return;
		clearTimeout(chipHoverTimer);
		chipHoverTimer = setTimeout(() => {
			const chip = (currentSettings.colorChips || []).find((c) => c.id === chipId);
			if (!chip) return;
			openChipSubmenu(chip);
		}, LONG_PRESS_MS);
	});
	$chipGrid.on('mouseleave', '.chip', () => {
		clearTimeout(chipHoverTimer);
	});
	$chipHex.on('input', () => {
		const maybe = normalizeHex($chipHex.val());
		if (maybe) {
			$chipPreview.css('background', maybe);
			setHSBUI(hexToHsb(maybe));
		}
	});
	$chipHue.on('input', () => {
		const next = hsbToHex($chipHue.val(), $chipSaturation.val(), $chipBrightness.val());
		setEditorColor(next);
	});
	$chipSaturation.on('input', () => {
		const next = hsbToHex($chipHue.val(), $chipSaturation.val(), $chipBrightness.val());
		setEditorColor(next);
	});
	$chipBrightness.on('input', () => {
		const next = hsbToHex($chipHue.val(), $chipSaturation.val(), $chipBrightness.val());
		setEditorColor(next);
	});
	$spotPickColor.on('click', async () => {
		if (!window.EyeDropper) return;
		try {
			const picker = new window.EyeDropper();
			const result = await picker.open();
			if (result && result.sRGBHex) setEditorColor(result.sRGBHex);
		} catch (_) {}
	});
	$closeChipSubmenu.on('click', closeChipSubmenu);
	$saveChip.on('click', saveChip);
	$deleteChip.on('click', deleteChip);
	bindSettingsHandlers();
	syncSettingsUI();
	openMainMenu();
});
