const _ = require('lodash');

// time values are all in milliseconds

var duration = 0;
var interval = 100;
var elapsed = 0;
var isRunning = false;
var timeoutRef = null;
let lastTickTime = 0;

var socket, io;

function setupIO(externalSocket, externalio){
	socket = externalSocket;
	io = externalio;
	socket.on("countdown.run", runClock);
	socket.on("countdown.stop", stopClock);
	socket.on("countdown.set-duration", setDuration);
	socket.on("countdown.reset", stopClock);
}

function setDuration(milliseconds){
	console.log("countdown.set-duration", milliseconds)
	duration = milliseconds;
	resetClock();
}

function resetClock(){
	elapsed = 0
	io.sockets.emit("countdown.state", {duration: duration, elapsed: elapsed, isRunning: isRunning})
};

function tickClock(){
	let now = Date.now();
	let tickDuration = now - lastTickTime;
	elapsed += tickDuration;

	if (elapsed >= duration) return clockComplete();

	io.sockets.emit("countdown.state", {duration: duration, elapsed: elapsed, isRunning: isRunning})
	lastTickTime = now;
	timeoutRef = setTimeout(tickClock, interval);
}

function runClock(){
	console.log("countdown.run")
	isRunning = true;
	lastTickTime = Date.now();
	tickClock();
};

function stopClock(){
	console.log("countdown.stop")
	isRunning = false;
	clearTimeout(timeoutRef);
	timeoutRef = null;
};

function clockComplete(){
	stopClock();
	io.sockets.emit("countdown.state", {duration: duration, elapsed: elapsed, isRunning: isRunning})
}

module.exports = {
	setupIO,
	setDuration,
	tickClock,
	runClock,
	stopClock,
	resetClock
}