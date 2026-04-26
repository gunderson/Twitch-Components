let platformString = navigator.userAgent;
let isOBS = platformString.search('OBS');
if (isOBS > -1) {
  $("html").addClass("obs")
}

let socket = io();
let tl = gsap.timeline();
let audioElement = null;

document.addEventListener('DOMContentLoaded', () => {
	socket.on("screen-alerts.clear", clearAlerts)
	socket.on("screen-alerts.trigger-alert", triggerAlert);
	
	// Create audio element for sound playback
	audioElement = document.createElement('audio');
	audioElement.preload = 'auto';
	document.body.appendChild(audioElement);
	
	// Store original labels for all alerts
	$('.alert .type-label').each(function() {
		const $label = $(this);
		if (!$label.data('original-label')) {
			$label.data('original-label', $label.text());
		}
	});
});

function triggerAlert(alertData){
	// Kill any existing timelines and reset state before starting new animation
	clearAlerts();
	
	// Create new timeline instance
	tl = gsap.timeline({
		onComplete: () => {
			socket.emit('screen-alerts.alert-display-complete');
		}
	});
	
	console.log('screen-alerts.trigger-alert', alertData);
	
	// Update text content
	const alertSelector = `#${alertData.type}`;
	const $alert = $(alertSelector);
	
	if ($alert.length === 0) {
		console.error(`Alert type ${alertData.type} not found`);
		socket.emit('screen-alerts.alert-display-complete');
		return;
	}
	
	// Update username
	$alert.find('.username').text(alertData.username || 'Anonymous');
	
	// Update message
	$alert.find('.message').text(alertData.message || '');
	
	// Update type label with platform
	const typeLabel = $alert.find('.type-label');
	const platformPrefix = alertData.platform || '';
	
	// Get or store original label
	let originalLabel = typeLabel.data('original-label');
	if (!originalLabel) {
		// If no stored label, use current text and store it
		originalLabel = typeLabel.text();
		typeLabel.data('original-label', originalLabel);
	}
	
	// Update label to show platform
	if (platformPrefix) {
		typeLabel.text(`${platformPrefix} ${originalLabel}`);
	} else {
		typeLabel.text(originalLabel);
	}
	
	// Play sound if available
	playAlertSound(alertData.type);
	
	// Animation sequence
	tl = gsap.timeline({
		onComplete: () => {
			socket.emit('screen-alerts.alert-display-complete');
		}
	});
	
	tl.set(alertSelector, {display: 'block'})
		.to(`${alertSelector} .content`, {duration: 0.5, opacity: 1, ease: "power2.out"})
		.to(`${alertSelector} .content`, {duration: 5, opacity: 1})
		.to(`${alertSelector} .content`, {duration: 0.5, opacity: 0, ease: "power2.in"})
		.set(alertSelector, {display: 'none'});
}

function playAlertSound(alertType) {
	if (!audioElement) return;
	
	// Try to load and play a sound file for this alert type
	// You can add sound files in a /sounds/ directory
	const soundPath = `/sounds/${alertType}.mp3`;
	audioElement.src = soundPath;
	audioElement.volume = 0.5;
	
	audioElement.play().catch(err => {
		// Sound file might not exist, that's okay
		console.log(`Could not play sound for ${alertType}:`, err.message);
	});
}

function clearAlerts(){
	// Kill any existing animation timeline
	if (tl) {
		tl.kill();
		tl = null;
	}
	
	// Stop any playing audio
	if (audioElement) {
		audioElement.pause();
		audioElement.currentTime = 0;
	}
	
	// Reset all alerts to hidden state
	$('.alert').css('display', 'none');
	$('.alert .content').css('opacity', '0');
};