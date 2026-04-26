window.TelestratorShared = (() => {
	function fitContain(containerWidth, containerHeight, sourceWidth, sourceHeight) {
		const safeSourceW = Math.max(1, sourceWidth || 1);
		const safeSourceH = Math.max(1, sourceHeight || 1);
		const safeContainerW = Math.max(1, containerWidth || 1);
		const safeContainerH = Math.max(1, containerHeight || 1);
		const sourceRatio = safeSourceW / safeSourceH;
		const containerRatio = safeContainerW / safeContainerH;

		let width;
		let height;
		if (sourceRatio > containerRatio) {
			width = safeContainerW;
			height = width / sourceRatio;
		} else {
			height = safeContainerH;
			width = height * sourceRatio;
		}

		return {
			x: (safeContainerW - width) / 2,
			y: (safeContainerH - height) / 2,
			width,
			height
		};
	}

	function resizeCanvasToElement(canvas, width, height) {
		const pixelRatio = window.devicePixelRatio || 1;
		const targetWidth = Math.max(1, Math.round(width * pixelRatio));
		const targetHeight = Math.max(1, Math.round(height * pixelRatio));
		if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
			canvas.width = targetWidth;
			canvas.height = targetHeight;
		}
		canvas.style.width = `${Math.round(width)}px`;
		canvas.style.height = `${Math.round(height)}px`;
		return pixelRatio;
	}

	function pointerToNormalized(clientX, clientY, canvasRect, videoFitRect) {
		const x = clientX - canvasRect.left - videoFitRect.x;
		const y = clientY - canvasRect.top - videoFitRect.y;
		const normalizedX = clamp(x / Math.max(1, videoFitRect.width), 0, 1);
		const normalizedY = clamp(y / Math.max(1, videoFitRect.height), 0, 1);
		return { x: normalizedX, y: normalizedY };
	}

	function normalizedToCanvasPoint(normalizedPoint, videoFitRect) {
		return {
			x: videoFitRect.x + normalizedPoint.x * videoFitRect.width,
			y: videoFitRect.y + normalizedPoint.y * videoFitRect.height
		};
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}

	function drawStroke(ctxMain, ctxShadow, stroke, fitRect) {
		if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 1) return;
		const style = stroke.style || {};
		const color = style.color || '#ff2d55';
		const thickness = Math.max(1, Number(style.thickness) || 4);
		const shadowWidth = Math.max(0, Number(style.shadowWidth) || 0);
		const points = stroke.points.map((pt) => normalizedToCanvasPoint(pt, fitRect));

		if (shadowWidth > 0 && ctxShadow) {
			paintPolyline(ctxShadow, points, {
				color: 'rgba(0,0,0,0.35)',
				thickness: thickness + shadowWidth
			});
		}
		paintPolyline(ctxMain, points, {
			color,
			thickness
		});
	}

	function paintPolyline(ctx, points, style) {
		if (!ctx || !points.length) return;
		ctx.save();
		ctx.strokeStyle = style.color;
		ctx.lineWidth = style.thickness;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		for (let i = 1; i < points.length; i += 1) {
			ctx.lineTo(points[i].x, points[i].y);
		}
		ctx.stroke();
		ctx.restore();
	}

	function clearContext(ctx) {
		if (!ctx || !ctx.canvas) return;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	}

	return {
		clamp,
		clearContext,
		drawStroke,
		fitContain,
		normalizedToCanvasPoint,
		pointerToNormalized,
		resizeCanvasToElement
	};
})();
