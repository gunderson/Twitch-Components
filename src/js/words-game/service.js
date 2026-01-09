const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('node:events');

let RunningLeaderboard = [];
let SessionLeaderboard = [];

let wordsData = GetWordListData(path.resolve(__dirname, "../..", "data", "words"));
let selectedWord;
let socket;
let streamerBotSocket;

const LETTER_SCORES = {
  a:1, b:3, c:3, d:2, e:1,
  f:4, g:2, h:4, i:1, j:8,
  k:5, l:1, m:3, n:1, o:1,
  p:3, q:10, r:1, s:1, t:1,
  u:1, v:4, w:4, x:8, y:4,
  z:10
};

const COMMANDS = [
    { command: "!startWords", gameFunctionName:"start", minRole: 3 },
    { command: "!continueWords", gameFunctionName:"continueWords", minRole: 3 },
    { command: "!pauseWords", gameFunctionName:"pauseWords", minRole: 3 },
    { command: "!resetWords", gameFunctionName:"resetWords", minRole: 3 },
];

const GAME_PHASES = {
	PRE_GAME: "PRE_GAME",
	IN_GAME: "IN_GAME",
	POST_GAME: "POST_GAME",
	GAME_STOPPED: "GAME_STOPPED",
	GAME_OVER: "GAME_OVER"
}


class Player {
	constructor(username, platform = "", role = 1, lastMessage = "", emoteURL = "") {
		this.username = username;
		this.color = 0x000000;
		this.role = role;
		this.platform = platform.toLowerCase();
		this.topScore = 0;
		this.sessionPlays = 0;
		this.roundScore = 0;
		this.score = 0;
		this.lastMessage = lastMessage;
		this.emoteURL = null;
		this.isActive = false;
		this.isTimedOut = false;
	}

	timeout(){
		this.isTimedOut = true;
	}

	activate() {
		this.isActive = true;
	}

	deactivate() {
		this.isActive = false;
	}

	reset() {
		this.topScore = Math.max(this.topScore, this.score);
		this.roundScore = 0;
		this.score = 0;
		this.deactivate();
	}
}

class Game {
	constructor() {
		this.phase = GAME_PHASES.GAME_STOPPED
		this.isActive = false;
		this.players = [];
		this.roundDuration = 1000 * 60 * 2; // 2 minutes
		this.round = 0;
		this.roundScore = 0;
		this.roundTarget = 0;
		this.betweenRoundDuration = 1000 * 15;
		this.currentWordDisplay = "lelho"
		this.currentWord = {
			root_word: "hello",
			subwords: [
				"hello",
				"hell",
				"helo"
			]
		}
		this.foundWords = [
			{
				player: {},
				word: "",
				score: 0
			}
		]
	}

	setCurrentWord(wordData){
		this.currentWord = wordData;
		this.currentWordDisplay = _.shuffle(this.currentWord.root_word);
		emitGameState();
	}

	shuffleWord(){
		this.currentWordDisplay = _.shuffle(this.currentWord.root_word);
		//TODO: Add letter scores and convert to an object 
		// console.log(this.currentWordDisplay);
		emitGameState();
	}

	attemptWord(player, text){
		let word = _.includes(this.currentWord.subwords, text) ? text : null;
		if (word){
			let score = this.getWordScore(word);
			_.remove(this.currentWord.subwords, word);
			game.foundWords.push({player, word, score});
			player.roundScore += roundScore;
			game.roundScore += score;
			player.timeout();
			emitGameState();
		}
	}

	getMaxScore(){
		return this.currentWord.subwords.reduce((m, word) => m + this.getWordScore(word), 0);
	}

	getWordScore(word){
		let letters = word.split("");
		let score = letters.reduce((m, letter) => m + LETTER_SCORES[letter], 0)
		return score;
	}

	getRoundGoal(){
		return Math.floor(0.66 * this.getMaxScore());
	}

	getRoundScore(){
		return this.players.reduce((m, player) => player.score, 0);
	}

	newSession(){
		this.players.forEach(player =>{
			player.reset();
		});
	}

	endSession(){}

	newRound(){
		this.clock.reset();
		this.players.forEach(player =>{
			player.score += player.roundScore; 
			player.roundScore = 0;
		});
		this.roundGoal = this.getRoundGoal;
	}

	endRound(){
		this.phase = GAME_PHASES.POST_GAME;
		emitGameState();
	}

	addPlayer(player) {
		//check to see if player already exists
		// does the player already exist
		let existingPlayer = _.find(this.players, {
			username: player.username,
			platform: player.platform
		});

		// add to player list
		if (existingPlayer) {
			console.log("existing player found")
			// existingPlayer.update(player);
			player = existingPlayer;
		} else {
			console.log("new player created")
			this.players.push(player);
		}

		return player;
	}

	removePlayer(player) {
		console.log("remove player")
		_.remove(this.players, player);
	}

	// commands
	start(data, player) {
		this.reset(true);
		this.startRound();
	}

	startRound(){
		this.round += 1;
		this.phase = GAME_PHASES.IN_GAME;
		this.clock.duration = this.roundDuration;
		this.isActive = true;
		this.clock.reset();
		this.clock.start();
		emitGameState();
	}
	
	continueWords(){

	}

	pauseWords(data, player){

	}

	resetWords(data, player) {
		this.reset(true)
	}

	end(data, player) {
		this.isActive = false;
	}

	// game state management

	reset(immedateReopen = false) {
		console.log("reset game")
		leaderboard.clear();
		this.round = 0;
		this.players.forEach(player => player.reset());
		this.players = [];
		this.isActive = false;
	}
}

class Leaderboard{
  constructor(){
  }
  
  updateScores(players, numShown = 10){
    let sortedPlayers = _.sortBy(players, ["score"]);
    console.log(sortedPlayers)
    let top10 = _(sortedPlayers).reverse().slice(0,numShown);
    this.clear();
    top10.forEach(player => {
      if (player.score == 0) return
      this.addScore(player);
    })
  }
  
  addScore(player){
    let username = player.username
    let platform = player.platform;
    let score = _.truncate(player.score, {length: 5, omission:''})
    let $score = this.$scoreTemplate.clone();
  }

  clear(){
  }
}

class Clock extends EventEmitter{
	constructor(){
		super();
		this.duration = 5000;
		this.elapsed = 0;
		this.tickFrequency = 100;
		this.isRunning = false;
		this.timerRef = null;
		this.prevTickTime = 0;
		this.cuePoints = [{
			time: 0,
			name: "start"
		}];
	}

	toJSON(){
		return {
			duration: this.duration,
			elapsed: this.elapsed,
			isRunning: this.isRunning
		}
	}

	addCuePoint(name, time){
		this.cuePoints.push({name, time})
	}

	 removeCuePoint(name){
		_.remove(this.cuePoints, {name});
	 }

	clearCuePoints(){
		this.cuePoints = [];
	}

	setDuration(ms){
		this.duration = ms;
	}

	start(){
		this.isRunning = true;
		this.prevTickTime = Date.now()
		this.emit('start')
		this.tick();
	}
	
	pause(){
		this.isRunning = false;
		if (this.timerRef){
			clearTimeout(this.timerRef);
			this.timerRef = null;
			this.emit('pause');
		}
	}
	
	reset(){
		this.pause();
		this.elapsed = 0;
		
	}
	
	tick(){
		let now = Date.now();
		let timeDelta = now - this.prevTickTime
		let newElapsed = this.elapsed + timeDelta
		this.cuePoints.forEach(cue =>{
			if (this.elapsed === cue.time || (this.elapsed < cue.time && cue.time < newElapsed)){
				// console.log("cue-point." + cue.name)
				this.emit("cue-point." + cue.name);
			}
		})
		this.elapsed = newElapsed;
		// corrects for timeouts that take longer than the frequency wants to be
		let nextTickDelta = timeDelta < 5 ? this.tickFrequency : this.tickFrequency - (this.elapsed % this.tickFrequency)
		// console.log("nextTickDelta", nextTickDelta)
		this.prevTickTime = now;
		this.timerRef = setTimeout(() => this.tick(), nextTickDelta);
		if (this.duration <= this.elapsed){
			this.elapsed = this.duration;
			// end clock
			this.emit('end')
			this.pause();
			// end game
		}
		this.emit('tick');
		this.report();
	}

	report(){
		// console.log('words-game.clock.report', this.elapsed);
		emitGameState();
	}
}

// ---------------------------------------------------------------------------

const leaderboard = new Leaderboard();
const clock = new Clock();
const game = new Game();
game.clock = clock;

let GAME_STATE = {
	game: game,
	leaderboard: leaderboard,
	runningLeaderboard: {}
}

function createShuffleCues(clock, game, shuffleFrequency){
	clock.clearCuePoints();
	let cueTime = 0;
	while (cueTime < game.roundDuration){
		clock.addCuePoint('shuffle', cueTime);
		cueTime += shuffleFrequency;
	}
}
createShuffleCues(clock, game, 1000 * 10);
clock.on('cue-point.shuffle', () => game.shuffleWord());
clock.on('end', () => game.endRound());

// ---------------------------------------------------------------------------


function setupIO(_socket, _io){
	io = _io;
	socket = _socket;

	socket.emit("words-game.state", GAME_STATE);

	socket.on("words-game.start", () => {
		game.start();
		console.log("words-game.start");
	})

	socket.on('get-words-list', () =>{
		if (!wordsData) wordsData = WordsGameService.GetWordListData(path.resolve(__dirname, "data", "words"));
		socket.emit('words-list', wordsData);
	})

	socket.on('select-word', root_word => {
		// if no wordData, pick a random word
		selectedWord = _.find(wordsData, {root_word:root_word})
		game.setCurrentWord(selectedWord);
		io.emit('selected-word', selectedWord);
		console.log("words-game: select-word");
	})

	socket.on('select-random-word',() => {
		selectedWord = getRandomWord();
		socket.emit('selected-word', selectedWord);
		game.setCurrentWord(selectedWord);
		console.log("words-game: select-random-word");
	})

	socket.on('get-selected-word', () =>{
		// if no word selected return null
		if (selectedWord) {
			io.emit('selected-word', selectedWord);
			console.log("words-game: getselected-word");
		} else {
			//do nothing
			
			console.log("words-game: select-word NONE");
		}
	})
}

function emitGameState(){
	io.sockets.emit("words-game.state", GAME_STATE)
}
function onClockFinished(){
	// if in-game, finish round
	// if post-game, start new round
}
function nextRound(){}
function pauseGame(){}
function startGame(){}

function setupStreamerbotListeners(_streamerBotSocket) {
	if (!_streamerBotSocket) return;
	streamerBotSocket = _streamerBotSocket;
	streamerBotSocket.on('Twitch.ChatMessage', (eventData) => {
		// console.log('Twitch Chat Message Received!', eventData);
		parseMessage(eventData);
	});

	streamerBotSocket.on('YouTube.Message', (eventData) => {
		console.log('YouTube Chat Message Received!', eventData);
		parseMessage(standardizeYTChatMessage(eventData));
	});
}

function standardizeYTChatMessage(eventData) {
	let role = 0;
	if (eventData.data.user.isOwner) role = 4
	if (eventData.data.user.isModerator) role = 3
	if (eventData.data.user.isSponsor) role = 2
	if (eventData.data.user.isVerified) role = 1


	return {
		event: eventData.event,
		data: {
			user: {
				name: eventData.data.user.name,
				role: role
			},
			message: {
				message: eventData.data.message
			},
			emotes: eventData.data.emotes
		}
	}
}

function parseMessage(messageData) {
	
	let username = messageData.data.user.name;
	let platform = messageData.event.source;
	let emoteURL = messageData.data.emotes.length ? messageData.data.emotes[0] : null;
	let role = messageData.data.user.role;
	let text = messageData.data.message.message.toLowerCase();


	let validCommand = COMMANDS.find(cmd => text.startsWith(cmd.command));
	if (validCommand) {
		if (role < validCommand.minRole) {
			console.log(`Command ${validCommand.command} by ${username}. User ${username} is only level ${role} but needs to be at least ${validCommand.minRole}.`)
		}
		game[validCommand.gameFunctionName](validCommand, player);
		return
	}
	
	let player = game.addPlayer(new Player(username, platform, role, text, emoteURL));
	game.attemptWord(player, text)
}


function getRandomWord(){
    let numWords = wordsData.length;
    return wordsData[Math.floor(Math.random() * numWords)];
}

function getWordAtIndex(wordData, index = 0){
    return wordData[index];
}

function ReadLeaderboard() {}

function WriteLeaderboard() {}

function GetWordListData(dirname) {
	//read path
	let fileList = fs.readdirSync(dirname);
	//filter files
	let wordData = fileList.map(filename => {
		let fileContents = fs.readFileSync(path.resolve(dirname, filename));
		return JSON.parse(fileContents);
	});
	//return list
	return wordData;
}

// Export the function
module.exports = {
	setupIO,
	setupStreamerbotListeners
};