window.addEventListener('DOMContentLoaded', () => {
	if (typeof io === 'undefined' || !window.TelestratorShared) return;
	const log = (...args) => {};//console.log('[telestrator:drawer]', ...args);
	log('page loaded');
	const socket = io();
	const shared = window.TelestratorShared;
	const pc = new RTCPeerConnection({
		iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
	});

	const $root = $('.telestrator.drawer');
	const $stage = $root.find('.stage');
	const $video = $root.find('video.remote-video');
	const $shadowCanvas = $root.find('canvas.shadow-layer');
	const $drawCanvas = $root.find('canvas.draw-layer');
	const $menu = $root.find('.menu');
	const $toggleMenu = $root.find('.toggle-menu');

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
	const $clear = $root.find('.omni-clear');
	const $connect = $root.find('.connect');
	const $fullscreen = $root.find('.fullscreen');
	let isMainMenuOpen = true;
	let isChipSubmenuOpen = false;

	let fitRect = { x: 0, y: 0, width: 1, height: 1 };
	let strokes = [];
	let settings = {
		color: '#ff2d55',
		thickness: 6,
		shadowWidth: 2,
		shadowBlur: 0,
		sampleRateMs: 16,
		autoClearMs: 0,
		colorChips: [{ id: 'default-red', color: '#ff2d55' }]
	};
	let editingChipId = null;

	let drawing = false;
	let currentPoints = [];
	let lastSampleAt = 0;
	let lastMoveLogAt = 0;
	/** Strokes we are drawing locally; ignore identical ids from the socket (our broadcasts echo back). */
	let ignoreEchoStrokeIds = new Set();
	let activeStrokeId = null;
	let activePointerId = null;
	let chipHoldTimer = null;
	let chipHoverTimer = null;
	const LONG_PRESS_MS = 550;

	const shadowCtx = $shadowCanvas.get(0).getContext('2d');
	const drawCtx = $drawCanvas.get(0).getContext('2d');

	function updateSettingsUI() {
		$thickness.val(settings.thickness);
		$thicknessValue.text(String(settings.thickness));
		$shadowWidth.val(Math.max(0, Number(settings.shadowWidth) || 0));
		$shadowWidthValue.text(String(Math.max(0, Number(settings.shadowWidth) || 0)));
		$shadowBlur.val(Math.max(0, Number(settings.shadowBlur) || 0));
		$shadowBlurValue.text(String(Math.max(0, Number(settings.shadowBlur) || 0)));
		$sampleRate.val(settings.sampleRateMs);
		$sampleRateValue.text(String(settings.sampleRateMs));
		$autoClear.val(Math.max(0, Number(settings.autoClearMs) || 0));
		$autoClearValue.text(String(Math.max(0, Number(settings.autoClearMs) || 0)));
		renderChips();
		setEditorColor(settings.color);
	}

	function pushSettings() {
		socket.emit('telestrator.set-settings', settings);
	}

	function applyShadowBlur() {
		const blurPx = Math.max(0, Number(settings.shadowBlur) || 0);
		shadowCtx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
	}

	function getCurrentStrokeStyle() {
		return {
			color: settings.color,
			thickness: Math.max(1, Number(settings.thickness) || 1),
			shadowWidth: Math.max(0, Number(settings.shadowWidth) || 0)
		};
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
			setEditorColor(chip.color || settings.color);
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
		const valid = normalizeHex(hex) || settings.color;
		$chipHex.val(valid);
		$chipPreview.css('background', valid);
		setHSBUI(hexToHsb(valid));
	}

	function renderChips() {
		const chips = Array.isArray(settings.colorChips) ? settings.colorChips : [];
		$chipGrid.empty();
		chips.forEach((chip) => {
			const $btn = $('<button type="button" class="chip"></button>');
			$btn.attr('data-chip-id', chip.id);
			$btn.css('background', chip.color);
			if (chip.color === settings.color) $btn.addClass('selected');
			$chipGrid.append($btn);
		});
		const $blank = $('<button type="button" class="chip blank">+</button>');
		$blank.attr('data-chip-id', '__new__');
		$chipGrid.append($blank);
	}

	function saveChip() {
		const color = normalizeHex($chipHex.val());
		if (!color) return;
		const chips = Array.isArray(settings.colorChips) ? [...settings.colorChips] : [];
		if (editingChipId) {
			const idx = chips.findIndex((c) => c.id === editingChipId);
			if (idx >= 0) chips[idx] = { ...chips[idx], color };
			else chips.push({ id: editingChipId, color });
		} else {
			editingChipId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
			chips.push({ id: editingChipId, color });
		}
		settings.color = color;
		settings.colorChips = chips;
		pushSettings();
		updateSettingsUI();
		closeChipSubmenu();
	}

	function deleteChip() {
		if (!editingChipId) return;
		settings.colorChips = (settings.colorChips || []).filter((c) => c.id !== editingChipId);
		editingChipId = null;
		pushSettings();
		updateSettingsUI();
		closeChipSubmenu();
	}

	function recalcLayout() {
		const w = $stage.width();
		const h = $stage.height();
		const pixelRatioA = shared.resizeCanvasToElement($shadowCanvas.get(0), w, h);
		const pixelRatioB = shared.resizeCanvasToElement($drawCanvas.get(0), w, h);
		shadowCtx.setTransform(pixelRatioA, 0, 0, pixelRatioA, 0, 0);
		drawCtx.setTransform(pixelRatioB, 0, 0, pixelRatioB, 0, 0);
		applyShadowBlur();
		const vw = $video.get(0).videoWidth || w;
		const vh = $video.get(0).videoHeight || h;
		fitRect = shared.fitContain(w, h, vw, vh);
		redraw();
	}

	function redraw() {
		shared.clearContext(shadowCtx);
		shared.clearContext(drawCtx);
		for (const stroke of strokes) {
			shared.drawStroke(drawCtx, shadowCtx, stroke, fitRect);
		}
	}

	function appendPointFromEvent(event) {
		const original = event.originalEvent || event;
		const pointSource = (original.touches && original.touches.length ? original.touches[0]
			: (original.changedTouches && original.changedTouches.length ? original.changedTouches[0] : original));
		if (pointSource.clientX == null || pointSource.clientY == null) return;
		const now = Date.now();
		if (now - lastSampleAt < (settings.sampleRateMs || 16)) return;
		lastSampleAt = now;
		const rect = $drawCanvas.get(0).getBoundingClientRect();
		const normalized = shared.pointerToNormalized(pointSource.clientX, pointSource.clientY, rect, fitRect);
		currentPoints.push({ x: normalized.x, y: normalized.y, t: now });
	}

	function copyStrokePoints(pts) {
		return (pts || []).map((p) => ({ x: p.x, y: p.y, t: p.t }));
	}

	function emitStrokeProgress() {
		if (!activeStrokeId || currentPoints.length < 2) return;
		log('line event: sending telestrator.stroke.append', { id: activeStrokeId, pointCount: currentPoints.length, live: true });
		socket.emit('telestrator.stroke.append', {
			id: activeStrokeId,
			points: copyStrokePoints(currentPoints),
			style: getCurrentStrokeStyle()
		});
	}

	function beginDraw(event) {
		if (event.button != null && event.button !== 0) return;
		activeStrokeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		ignoreEchoStrokeIds.add(activeStrokeId);
		drawing = true;
		currentPoints = [];
		lastSampleAt = 0;
		lastMoveLogAt = 0;
		const pType = event.pointerType != null ? event.pointerType : (event.touches ? 'touch' : 'mouse');
		log('draw input: start', { type: pType, pointerId: event.pointerId, strokeId: activeStrokeId });
		appendPointFromEvent(event);
	}

	function moveDraw(event) {
		if (!drawing) return;
		event.preventDefault();
		appendPointFromEvent(event);
		const now = Date.now();
		if (now - lastMoveLogAt > 80 || (currentPoints.length > 0 && currentPoints.length % 12 === 0)) {
			lastMoveLogAt = now;
			const pType = event.pointerType != null ? event.pointerType : (event.touches ? 'touch' : 'mouse');
			log('draw input: move', { type: pType, pointCount: currentPoints.length, drawing: true });
		}
		redraw();
		if (currentPoints.length > 1) {
			shared.drawStroke(drawCtx, shadowCtx, {
				points: currentPoints,
				style: getCurrentStrokeStyle()
			}, fitRect);
		}
		emitStrokeProgress();
	}

	function endDraw(event) {
		if (!drawing) return;
		event.preventDefault();
		const pType = event.pointerType != null ? event.pointerType : (event.changedTouches ? 'touch' : 'mouse');
		drawing = false;
		const idForThis = activeStrokeId;
		appendPointFromEvent(event);
		log('draw input: end', { type: pType, pointCount: currentPoints.length });
		if (currentPoints.length < 2) {
			log('line event: skip emit (not enough points)', { pointCount: currentPoints.length });
			if (idForThis) ignoreEchoStrokeIds.delete(idForThis);
			activeStrokeId = null;
			currentPoints = [];
			return;
		}
		emitStrokeProgress();
		const localStroke = {
			id: idForThis,
			points: copyStrokePoints(currentPoints),
			style: getCurrentStrokeStyle()
		};
		strokes.push(localStroke);
		redraw();
		activeStrokeId = null;
		currentPoints = [];
	}

	function bindDrawInput() {
		const canvas = $drawCanvas.get(0);
		if (window.PointerEvent) {
			canvas.addEventListener('pointerdown', (event) => {
				activePointerId = event.pointerId;
				if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
				beginDraw(event);
			});
			canvas.addEventListener('pointermove', (event) => {
				if (!drawing || event.pointerId !== activePointerId) return;
				moveDraw(event);
			});
			const endPointer = (event) => {
				if (!drawing || event.pointerId !== activePointerId) return;
				endDraw(event);
				activePointerId = null;
			};
			canvas.addEventListener('pointerup', endPointer);
			canvas.addEventListener('pointercancel', endPointer);
			return;
		}

		canvas.addEventListener('mousedown', beginDraw);
		window.addEventListener('mousemove', moveDraw);
		window.addEventListener('mouseup', endDraw);
		canvas.addEventListener('touchstart', beginDraw, { passive: false });
		canvas.addEventListener('touchmove', moveDraw, { passive: false });
		window.addEventListener('touchend', endDraw, { passive: false });
		window.addEventListener('touchcancel', endDraw, { passive: false });
	}

	pc.ontrack = (event) => {
		$video.get(0).srcObject = event.streams[0];
		$connect.hide();
		$video.get(0).play().catch(() => {
			$connect.show();
		});
	};
	pc.onicecandidate = (event) => {
		if (!event.candidate) return;
		socket.emit('telestrator.webrtc.ice', { to: hostSocketId, candidate: event.candidate });
	};

	let hostSocketId = null;
	socket.emit('telestrator.register', { role: 'drawer' });
	socket.emit('telestrator.get-state');

	socket.on('telestrator.registered', (payload) => {
		hostSocketId = payload.hostSocketId;
		if (hostSocketId) socket.emit('telestrator.webrtc.request-offer', { meta: { role: 'drawer' } });
		$connect.toggle(!hostSocketId);
	});

	socket.on('telestrator.state', (state) => {
		if (!state) return;
		log('received telestrator.state', { strokeCount: (state.strokes && state.strokes.length) || 0 });
		hostSocketId = state.session && state.session.hostSocketId;
		strokes = Array.isArray(state.strokes) ? state.strokes : [];
		ignoreEchoStrokeIds.clear();
		settings = { ...settings, ...(state.settings || {}) };
		updateSettingsUI();
		applyShadowBlur();
		redraw();
		if (hostSocketId) socket.emit('telestrator.webrtc.request-offer', { meta: { role: 'drawer' } });
		$connect.toggle(!hostSocketId);
	});

	socket.on('telestrator.settings', (nextSettings) => {
		settings = { ...settings, ...(nextSettings || {}) };
		updateSettingsUI();
		applyShadowBlur();
		redraw();
	});

	socket.on('telestrator.stroke.append', (stroke) => {
		if (!stroke) return;
		if (stroke.id && ignoreEchoStrokeIds.has(stroke.id)) {
			log('line event: received telestrator.stroke.append (skip own echo)', { id: stroke.id, pointCount: stroke.points ? stroke.points.length : 0 });
			return;
		}
		log('line event: received telestrator.stroke.append', {
			id: stroke.id,
			pointCount: stroke.points ? stroke.points.length : 0
		});
		if (!stroke.id) {
			strokes.push(stroke);
		} else {
			const idx = strokes.findIndex((s) => s && s.id === stroke.id);
			if (idx >= 0) strokes[idx] = stroke;
			else strokes.push(stroke);
		}
		redraw();
	});

	socket.on('telestrator.clear', () => {
		log('received telestrator.clear');
		drawing = false;
		currentPoints = [];
		activePointerId = null;
		activeStrokeId = null;
		ignoreEchoStrokeIds.clear();
		strokes = [];
		redraw();
	});

	socket.on('telestrator.webrtc.offer', async (payload) => {
		hostSocketId = payload.from;
		await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);
		socket.emit('telestrator.webrtc.answer', {
			to: payload.from,
			sdp: pc.localDescription
		});
	});

	socket.on('telestrator.webrtc.ice', async (payload) => {
		if (!payload || !payload.candidate) return;
		try {
			await pc.addIceCandidate(payload.candidate);
		} catch (err) {
			console.warn('drawer ICE failed', err);
		}
	});

	$toggleMenu.on('click', (event) => {
		event.stopPropagation();
		toggleMainMenu();
	});
	document.addEventListener('pointerdown', (event) => {
		if (!isMainMenuOpen) return;
		const target = event.target;
		if (target.closest('.menu') || target.closest('.toggle-menu')) return;
		closeMainMenu();
	});
	function clearLineDataLocal() {
		drawing = false;
		currentPoints = [];
		activePointerId = null;
		activeStrokeId = null;
		ignoreEchoStrokeIds.clear();
		strokes = [];
		redraw();
	}
	$clear.on('click', (e) => {
		e.stopPropagation();
		clearLineDataLocal();
		socket.emit('telestrator.clear');
	});
	$connect.on('click', () => {
		if (hostSocketId) {
			socket.emit('telestrator.webrtc.request-offer', { meta: { role: 'drawer', force: true } });
			$video.get(0).play().catch(() => {});
		}
	});
	$fullscreen.on('click', async () => {
		try {
			if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
			else await document.exitFullscreen();
			closeMainMenu();
		} catch (err) {
			console.warn('fullscreen failed', err);
		}
	});
	document.addEventListener('fullscreenchange', () => {
		closeMainMenu();
	});

	$chipGrid.on('click', '.chip', (event) => {
		const chipId = $(event.currentTarget).attr('data-chip-id');
		if (chipId === '__new__') {
			editingChipId = null;
			setEditorColor(settings.color);
			openChipSubmenu({ id: null, color: settings.color });
			return;
		}
		const chip = (settings.colorChips || []).find((c) => c.id === chipId);
		if (!chip) return;
		settings.color = chip.color;
		pushSettings();
		updateSettingsUI();
	});
	$chipGrid.on('pointerdown', '.chip', (event) => {
		event.preventDefault();
		const chipId = $(event.currentTarget).attr('data-chip-id');
		if (chipId === '__new__') return;
		clearTimeout(chipHoldTimer);
		chipHoldTimer = setTimeout(() => {
			const chip = (settings.colorChips || []).find((c) => c.id === chipId);
			if (!chip) return;
			openChipSubmenu(chip);
		}, LONG_PRESS_MS);
	});
	$chipGrid.on('pointerup pointercancel pointerleave', '.chip', () => {
		clearTimeout(chipHoldTimer);
	});
	$chipGrid.on('mousedown touchstart', '.chip', (event) => {
		event.preventDefault();
	});
	$chipGrid.on('contextmenu', '.chip', (event) => {
		event.preventDefault();
	});
	$chipGrid.on('mouseenter', '.chip', (event) => {
		const chipId = $(event.currentTarget).attr('data-chip-id');
		if (chipId === '__new__') return;
		clearTimeout(chipHoverTimer);
		chipHoverTimer = setTimeout(() => {
			const chip = (settings.colorChips || []).find((c) => c.id === chipId);
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
	$thickness.on('input', () => {
		settings.thickness = Number($thickness.val()) || 6;
		$thicknessValue.text(String(settings.thickness));
		pushSettings();
	});
	$shadowWidth.on('input', () => {
		settings.shadowWidth = Math.max(0, Number($shadowWidth.val()) || 0);
		$shadowWidthValue.text(String(settings.shadowWidth));
		pushSettings();
	});
	$shadowBlur.on('input', () => {
		settings.shadowBlur = Math.max(0, Number($shadowBlur.val()) || 0);
		$shadowBlurValue.text(String(settings.shadowBlur));
		applyShadowBlur();
		redraw();
		pushSettings();
	});
	$sampleRate.on('input', () => {
		settings.sampleRateMs = Number($sampleRate.val()) || 16;
		$sampleRateValue.text(String(settings.sampleRateMs));
		pushSettings();
	});
	$autoClear.on('input change', () => {
		settings.autoClearMs = Math.max(0, Number($autoClear.val()) || 0);
		$autoClearValue.text(String(settings.autoClearMs));
		pushSettings();
	});

	bindDrawInput();
	$video.on('loadedmetadata', recalcLayout);
	$(window).on('resize', recalcLayout);
	document.addEventListener('fullscreenchange', recalcLayout);

	updateSettingsUI();
	recalcLayout();
	$connect.hide();
	openMainMenu();
});
