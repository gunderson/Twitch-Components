window.addEventListener('DOMContentLoaded', () => {
	if (typeof io === 'undefined' || !window.TelestratorShared) return;
	const log = (...args) => {};//console.log('[telestrator:display]', ...args);
	log('page loaded');
	const socket = io();
	const shared = window.TelestratorShared;

	const $root = $('.telestrator.display');
	const $shadowCanvas = $root.find('canvas.shadow-layer');
	const $drawCanvas = $root.find('canvas.draw-layer');
	const shadowCtx = $shadowCanvas.get(0).getContext('2d');
	const drawCtx = $drawCanvas.get(0).getContext('2d');

	let fitRect = { x: 0, y: 0, width: 1, height: 1 };
	let strokes = [];

	function recalcLayout() {
		const w = $root.width();
		const h = $root.height();
		const pixelRatioA = shared.resizeCanvasToElement($shadowCanvas.get(0), w, h);
		const pixelRatioB = shared.resizeCanvasToElement($drawCanvas.get(0), w, h);
		shadowCtx.setTransform(pixelRatioA, 0, 0, pixelRatioA, 0, 0);
		drawCtx.setTransform(pixelRatioB, 0, 0, pixelRatioB, 0, 0);
		fitRect = { x: 0, y: 0, width: w, height: h };
		redraw();
	}

	function redraw() {
		shared.clearContext(shadowCtx);
		shared.clearContext(drawCtx);
		for (const stroke of strokes) {
			shared.drawStroke(drawCtx, shadowCtx, stroke, fitRect);
		}
	}

	socket.emit('telestrator.register', { role: 'display' });
	socket.emit('telestrator.get-state');

	socket.on('telestrator.state', (state) => {
		strokes = (state && Array.isArray(state.strokes)) ? state.strokes : [];
		log('received telestrator.state', { strokeCount: strokes.length });
		redraw();
	});

	socket.on('telestrator.stroke.append', (stroke) => {
		if (!stroke) return;
		log('line event: received telestrator.stroke.append', {
			id: stroke.id,
			pointCount: stroke.points ? stroke.points.length : 0
		});
		if (stroke.id) {
			const idx = strokes.findIndex((s) => s && s.id === stroke.id);
			if (idx >= 0) strokes[idx] = stroke;
			else strokes.push(stroke);
		} else {
			strokes.push(stroke);
		}
		redraw();
	});

	socket.on('telestrator.clear', () => {
		log('received telestrator.clear');
		strokes = [];
		redraw();
	});

	$(window).on('resize', recalcLayout);
	document.addEventListener('fullscreenchange', recalcLayout);
	recalcLayout();
});
