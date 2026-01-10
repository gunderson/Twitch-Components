const _ = require('lodash');

var alertQueue = [];
var alertRunning = false;
var io;
var socket;

function setupIO(_socket, _io){
	io = _io;
	socket = _socket;

	// Simulation events for all alert types
	socket.on('screen-alerts.sim-tw-follow', () => {
		triggerAlert({
			type: "tw-follow",
			platform: "Twitch",
			username: "ACoolUsername",
			message: "I love you so much!"
		});
	});

	socket.on('screen-alerts.sim-tw-sub', () => {
		triggerAlert({
			type: "tw-sub",
			platform: "Twitch",
			username: "SubscriberName",
			message: "Thanks for the sub!"
		});
	});

	socket.on('screen-alerts.sim-tw-prime-sub', () => {
		triggerAlert({
			type: "tw-prime-sub",
			platform: "Twitch",
			username: "PrimeSubName",
			message: "Prime sub activated!"
		});
	});

	socket.on('screen-alerts.sim-tw-gift-sub', () => {
		triggerAlert({
			type: "tw-gift-sub",
			platform: "Twitch",
			username: "GiftGiver",
			message: "Gifted a sub!"
		});
	});

	socket.on('screen-alerts.sim-tw-gift-sub-multi', () => {
		triggerAlert({
			type: "tw-gift-sub-multi",
			platform: "Twitch",
			username: "GiftGiver",
			message: "Gifted 5 subs!",
			amount: 5
		});
	});

	socket.on('screen-alerts.sim-tw-bits', () => {
		triggerAlert({
			type: "tw-bits",
			platform: "Twitch",
			username: "BitsGiver",
			message: "Cheered 500 bits!",
			amount: 500
		});
	});

	socket.on('screen-alerts.sim-yt-sub', () => {
		triggerAlert({
			type: "yt-sub",
			platform: "YouTube",
			username: "YTSubscriber",
			message: "Thanks for subscribing!"
		});
	});

	socket.on('screen-alerts.sim-yt-member', () => {
		triggerAlert({
			type: "yt-member",
			platform: "YouTube",
			username: "YTMember",
			message: "Joined as a member!"
		});
	});

	socket.on('screen-alerts.sim-yt-superchat', () => {
		triggerAlert({
			type: "yt-superchat",
			platform: "YouTube",
			username: "SuperChatUser",
			message: "Super chat message!",
			amount: "$10.00"
		});
	});

	socket.on('screen-alerts.sim-yt-donation', () => {
		triggerAlert({
			type: "yt-donation",
			platform: "YouTube",
			username: "DonorName",
			message: "Donation message!",
			amount: "$25.00"
		});
	});

	socket.on('screen-alerts.alert-display-complete', onAlertDisplayComplete);
	socket.on('screen-alerts.get-queue', () => {
		socket.emit('screen-alerts.queue-update', alertQueue);
	});
}

function setupStreamerbotListeners(streamerBotSocket){
	if (!streamerBotSocket) return;

	// Twitch Events
	streamerBotSocket.on('Twitch.Follow', (eventData) => {
		parseTwitchFollow(eventData);
	});

	streamerBotSocket.on('Twitch.Subscription', (eventData) => {
		parseTwitchSubscription(eventData);
	});

	streamerBotSocket.on('Twitch.SubscriptionGift', (eventData) => {
		parseTwitchGiftSub(eventData);
	});

	streamerBotSocket.on('Twitch.Cheer', (eventData) => {
		parseTwitchBits(eventData);
	});

	// YouTube Events
	streamerBotSocket.on('YouTube.Subscription', (eventData) => {
		parseYouTubeSubscription(eventData);
	});

	streamerBotSocket.on('YouTube.Membership', (eventData) => {
		parseYouTubeMembership(eventData);
	});

	streamerBotSocket.on('YouTube.Superchat', (eventData) => {
		parseYouTubeSuperchat(eventData);
	});

	streamerBotSocket.on('YouTube.Donation', (eventData) => {
		parseYouTubeDonation(eventData);
	});
}

function parseTwitchFollow(eventData) {
	const data = eventData.data || eventData;
	triggerAlert({
		type: "tw-follow",
		platform: "Twitch",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || `${data.user?.name || data.username || "Someone"} just followed!`
	});
}

function parseTwitchSubscription(eventData) {
	const data = eventData.data || eventData;
	const isPrime = data.subscription?.plan === "Prime" || data.isPrime;
	
	triggerAlert({
		type: isPrime ? "tw-prime-sub" : "tw-sub",
		platform: "Twitch",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || data.subscription?.message || "Thanks for subscribing!",
		months: data.subscription?.months || data.months || 1
	});
}

function parseTwitchGiftSub(eventData) {
	const data = eventData.data || eventData;
	const count = data.giftCount || data.count || 1;
	
	triggerAlert({
		type: count > 1 ? "tw-gift-sub-multi" : "tw-gift-sub",
		platform: "Twitch",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || `Gifted ${count} subscription${count > 1 ? 's' : ''}!`,
		amount: count
	});
}

function parseTwitchBits(eventData) {
	const data = eventData.data || eventData;
	triggerAlert({
		type: "tw-bits",
		platform: "Twitch",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || data.chatMessage || `Cheered ${data.bits || data.amount || 0} bits!`,
		amount: data.bits || data.amount || 0
	});
}

function parseYouTubeSubscription(eventData) {
	const data = eventData.data || eventData;
	triggerAlert({
		type: "yt-sub",
		platform: "YouTube",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || "Thanks for subscribing!"
	});
}

function parseYouTubeMembership(eventData) {
	const data = eventData.data || eventData;
	triggerAlert({
		type: "yt-member",
		platform: "YouTube",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || "Joined as a member!"
	});
}

function parseYouTubeSuperchat(eventData) {
	const data = eventData.data || eventData;
	triggerAlert({
		type: "yt-superchat",
		platform: "YouTube",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || data.chatMessage || "Super chat message!",
		amount: data.amount || data.money || "$0.00"
	});
}

function parseYouTubeDonation(eventData) {
	const data = eventData.data || eventData;
	triggerAlert({
		type: "yt-donation",
		platform: "YouTube",
		username: data.user?.name || data.username || "Anonymous",
		message: data.message || "Donation message!",
		amount: data.amount || data.money || "$0.00"
	});
}

function resetQueue(){
	alertQueue = [];
	alertRunning = false;
	io.sockets.emit('screen-alerts.clear');
	io.sockets.emit('screen-alerts.queue-update', []);
}

function cancelAlert(){
	io.sockets.emit('screen-alerts.clear');
}

function triggerAlert(alertData){
	if (alertRunning) {
		alertQueue.push(alertData);
		io.sockets.emit('screen-alerts.queue-update', alertQueue);
	} else {
		io.sockets.emit('screen-alerts.trigger-alert', alertData);
		alertRunning = true;
		// Update queue display (current alert is running, not in queue)
		io.sockets.emit('screen-alerts.queue-update', alertQueue);
	}
}

function onAlertDisplayComplete(alertData){
	alertRunning = false;
	const nextAlert = alertQueue.shift();
	if (nextAlert) {
		triggerAlert(nextAlert);
	} else {
		io.sockets.emit('screen-alerts.queue-update', []);
	}
}

module.exports = {
	setupIO,
	setupStreamerbotListeners,
	resetQueue,
	cancelAlert
}