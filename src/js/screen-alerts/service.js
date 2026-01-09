const _ = require('lodash');

var alertQueue = [];
var alertRunning = false;

function setupIO(_socket, _io){
	io = _io;
	socket = _socket;

	socket.on('screen-alerts.sim-tw-follow', () => {
		let alertData = {
			type: "#tw-follow",
			username: "ACoolUsername",
			message: "I love you so much!"
		}
		console.log('screen-alerts.sim-tw-follow');
		triggerAlert(alertData);
	})

	socket.on('screen-alerts.alert-display-complete', onAlertDisplayComplete);
}

function setupStreamerbotListeners(streamerBotSocket){
	
}

function resetQueue(){

}

function cancelAlert(){
	io.sockets.emit('screen-alerts.clear');
}

function triggerAlert(alertData){
	if (alertRunning) {
		alertQueue.push(alertData);
	} else {
		io.sockets.emit('screen-alerts.trigger-alert', alertData);
		alertRunning = true;
	}
}

function onAlertDisplayComplete(alertData){
	alertRunning = false;
	// _.remove(alertQueue, alertData);
	alertData = alertQueue.shift();
	if (alertData) {
		triggerAlert(alertData);
	}
}

module.exports = {
	setupIO,
	setupStreamerbotListeners
}