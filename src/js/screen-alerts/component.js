let platformString = navigator.userAgent;
let isOBS = platformString.search('OBS');
if (isOBS > -1) {
  $("html").addClass("obs")
}

let socket = io();
let tl = gsap.timeline();

document.addEventListener('DOMContentLoaded', () => {
	socket.on("screen-alerts.clear", clearAlerts)
	socket.on("screen-alerts.trigger-alert", triggerAlert);
});

function triggerAlert(alertData){
	clearAlerts();
	console.log('screen-alerts.trigger-alert', alertData)
	tl = gsap.timeline();
	tl.to(alertData.type, {display: 'block'})
	.to(alertData.type + ' .content', {duration: 0.5, opacity: 1})
	.to(alertData.type + ' .content', {duration: 5, opacity: 1})
	.to(alertData.type + ' .content', {duration: 0.5, opacity: 0})
	.to(alertData.type, {display: 'none'})
	.then(() => socket.emit('screen-alerts.alert-display-complete'));
}

function clearAlerts(){
	tl.revert();
};