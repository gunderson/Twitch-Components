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

// Timing configuration - all coordinated timings between frontend and backend
// This object is passed to the frontend so timings stay synchronized
const TIMING_CONFIG = {
	// Pre-round countdown (shown before each round starts)
	preRoundCountdown: {
		duration: 3000, // Total countdown duration in ms (3 seconds)
		numberDuration: 1000, // Time each number is shown (1 second)
		goDuration: 500, // Time "GO!" is shown (0.5 seconds)
		animationDuration: 300 // Animation duration for countdown numbers
	},
	// Post-game sequence timings
	postGame: {
		interstitialDuration: 5000, // Time to show performance/interstitial (5 seconds)
		leaderboardDuration: 10000, // Time to show leaderboards before next round (10 seconds)
		totalDuration: 15000 // Total post-game duration (5s interstitial + 10s leaderboard)
	},
	// Round timing
	round: {
		clockStartDelay: 3500 // Delay after countdown before starting game clock (3s countdown + 0.5s buffer)
	}
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
		this.isLocked = false;
		this.currentLockCycle = 0;
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
		this.phase = GAME_PHASES.PRE_GAME
		this.isActive = false;
		this.players = [];
		this.roundDuration = 1000 * 60 * 2; // 2 minutes
		this.round = 0;
		this.roundScore = 0;
		this.roundTarget = 0;
		this.betweenRoundDuration = 1000 * 15;
		this.currentWordDisplay = []
		this.currentWord = {
			root_word: "hello",
			subwords: [
				"hello",
				"hell",
				"helo"
			]
		}
		this.foundWords = []
		this.level = 0;
		this.lockCycles = 8; // Number of lock cycles per round
		this.currentLockCycle = 0;
		this.lockCycleEndTimes = [];
		this.decoyLetterIndex = -1; // Index of decoy letter (-1 if none)
		this.decoyRevealTime = 0; // When to reveal decoy (ms into round)
		this.hiddenLetterIndex = -1; // Index of hidden letter (-1 if none)
		this.hiddenLetterRevealTime = 0; // When to reveal hidden letter
		this.roundSuccess = false;
		this.allTimeScores = {}; // Store all-time scores
		this.performanceStars = 0; // Performance rating (0-5 stars)
		// Load all-time scores after game instance is created (see below)
	}

	setCurrentWord(wordData){
		this.currentWord = wordData;
		this.currentWordDisplay = this.createLetterDisplay(this.currentWord.root_word);
		emitGameState();
	}

	shuffleWord(){
		this.currentWordDisplay = this.createLetterDisplay(this.currentWord.root_word);
		emitGameState();
	}

	createLetterDisplay(word){
		// Shuffle the letters and create objects with letter and value
		let shuffled = _.shuffle(word.split(''));
		return shuffled.map(letter => ({
			letter: letter.toLowerCase(),
			value: LETTER_SCORES[letter.toLowerCase()] || 0
		}));
	}

	attemptWord(player, text){
		// Check if player is locked in current cycle
		if (player.isLocked && player.currentLockCycle === this.currentLockCycle) {
			return false; // Player already submitted this cycle
		}
		
		// Normalize text for comparison (lowercase, trim)
		text = text.toLowerCase().trim();
		
		// First check if word has already been found (prevents "stealing")
		let alreadyFound = this.foundWords.some(fw => fw.word.toLowerCase() === text);
		if (alreadyFound) {
			return false; // Word has already been guessed
		}
		
		// Then check if word is a valid subword (case-insensitive comparison)
		let wordMatch = this.currentWord.subwords.find(sw => sw.toLowerCase() === text);
		if (wordMatch){
			// Use the original word from the array to maintain proper casing
			let word = wordMatch;
			let score = this.getWordScore(word);
			_.remove(this.currentWord.subwords, word);
			game.foundWords.push({player, word, score});
			player.roundScore += score;
			player.score += score;
			game.roundScore += score;
			
			// Lock player for this cycle
			player.isLocked = true;
			player.currentLockCycle = this.currentLockCycle;
			
			player.timeout();
			emitGameState();
			return true;
		}
		return false;
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
		// Calculate minimum group score based on level (reduced significantly for low levels)
		// Level 0: 25%, Level 1: 30%, Level 2: 35%, Level 3: 40%, Level 4: 45%
		// Level 5: 50%, Level 6: 55%, Level 7: 60%, Level 8: 70%, Level 9+: 80%
		let minPercent;
		if (this.level === 0) {
			minPercent = 0.25;
		} else if (this.level === 1) {
			minPercent = 0.30;
		} else if (this.level === 2) {
			minPercent = 0.35;
		} else if (this.level === 3) {
			minPercent = 0.40;
		} else if (this.level === 4) {
			minPercent = 0.45;
		} else if (this.level === 5) {
			minPercent = 0.50;
		} else if (this.level === 6) {
			minPercent = 0.55;
		} else if (this.level === 7) {
			minPercent = 0.60;
		} else if (this.level === 8) {
			minPercent = 0.70;
		} else {
			minPercent = 0.80;
		}
		return Math.floor(minPercent * this.getMaxScore());
	}
	
	getLevelModifiers(){
		// Level 0-2: No modifiers
		// Level 3-5: Decoy letter
		// Level 6-8: Decoy + hidden letter
		// Level 9: Decoy + hidden letter (more challenging)
		let modifiers = {
			hasDecoy: this.level >= 3,
			hasHidden: this.level >= 6
		};
		return modifiers;
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
		// Check if round was successful
		this.roundSuccess = this.roundScore >= this.roundTarget;
		
		// Update all-time scores
		updateAllTimeScores(this.players);
		
		// Calculate performance rating (0-5 stars) based on how far above target
		// If failed, stars = 0
		let stars = 0;
		if (this.roundSuccess && this.roundTarget > 0) {
			// Calculate how much above target (as a percentage of target)
			// 0% above target = 1 star, 100% above target = 5 stars
			let excessScore = this.roundScore - this.roundTarget;
			let excessPercent = excessScore / this.roundTarget;
			// Map 0-100% excess to 1-5 stars
			stars = Math.min(5, Math.max(1, Math.floor(1 + excessPercent * 4)));
		}
		
		// Set up post-game clock for sequencing using timing config
		this.clock.clearCuePoints();
		this.clock.setDuration(TIMING_CONFIG.postGame.totalDuration);
		
		// Schedule cue points for post-game sequence
		this.clock.addCuePoint('show-leaderboards', TIMING_CONFIG.postGame.interstitialDuration);
		
		// If successful, schedule next round start via cue point (backend triggers the scene)
		if (this.roundSuccess) {
			this.clock.addCuePoint('start-next-round', TIMING_CONFIG.postGame.totalDuration);
		}
		
		// Store performance stars in game state
		this.performanceStars = stars;
		
		emitGameState();
		
		// Start post-game clock
		this.clock.reset();
		this.clock.start();
	}
	
	progressLevel(){
		// Calculate performance to determine level progression based on excess above target
		let excessPercent = 0;
		if (this.roundTarget > 0) {
			let excessScore = this.roundScore - this.roundTarget;
			excessPercent = excessScore / this.roundTarget;
		}
		
		if (excessPercent >= 1.0) {
			// Excellent performance (100%+ above target) - skip a level
			this.level = Math.min(9, this.level + 5);
		} else if (excessPercent >= 0.5) {
			// Good performance - Good progression
			this.level = Math.min(9, this.level + 3);
		} else if (performancePercent < 0.5) {
			// Poor performance - Poor progression
			this.level = Math.max(0, this.level + 1);
		}
		// Otherwise stay at same level
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
		this.phase = GAME_PHASES.PRE_GAME;
		emitGameState();
		// Start round immediately - countdown will be handled on frontend
		this.startRound();
	}

	startRound(){
		this.round += 1;
		this.phase = GAME_PHASES.IN_GAME;
		this.clock.duration = this.roundDuration;
		this.isActive = true;
		this.roundScore = 0;
		this.foundWords = [];
		
		// Select new random word
		let newWord = getRandomWord();
		this.setCurrentWord(newWord);
		
		// Calculate round target
		this.roundTarget = this.getRoundGoal();
		
		// Setup level modifiers
		let modifiers = this.getLevelModifiers();
		this.setupLevelModifiers(modifiers);
		
		// Setup lock cycles
		this.setupLockCycles();
		
		// Reset player locks
		this.players.forEach(player => {
			player.isLocked = false;
			player.currentLockCycle = 0;
		});
		
		// Reset clock but don't start it yet - wait for countdown
		this.clock.reset();
		this.clock.clearCuePoints();
		
		// Set up shuffle cue points (every 10 seconds)
		let shuffleFrequency = 1000 * 10;
		let cueTime = 0;
		while (cueTime < this.roundDuration) {
			this.clock.addCuePoint('shuffle', cueTime);
			cueTime += shuffleFrequency;
		}
		
		emitGameState();
		// Start clock after countdown (using timing config)
		setTimeout(() => {
			this.clock.start();
			emitGameState();
		}, TIMING_CONFIG.round.clockStartDelay);
	}
	
	setupLevelModifiers(modifiers){
		this.decoyLetterIndex = -1;
		this.hiddenLetterIndex = -1;
		this.decoyRevealTime = 0;
		this.hiddenLetterRevealTime = 0;
		
		if (modifiers.hasDecoy) {
			// Add a decoy letter (random letter not in the word)
			let rootLetters = this.currentWord.root_word.toLowerCase().split('');
			let alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
			let availableDecoys = alphabet.filter(l => !rootLetters.includes(l));
			if (availableDecoys.length > 0) {
				let decoyLetter = availableDecoys[Math.floor(Math.random() * availableDecoys.length)];
				// Insert decoy into display at random position
				let decoyIndex = Math.floor(Math.random() * this.currentWordDisplay.length);
				this.currentWordDisplay.splice(decoyIndex, 0, {
					letter: decoyLetter,
					value: LETTER_SCORES[decoyLetter] || 0,
					isDecoy: true
				});
				this.decoyLetterIndex = decoyIndex;
				// Reveal decoy at 60% through the round
				this.decoyRevealTime = this.roundDuration * 0.6;
			}
		}
		
		if (modifiers.hasHidden) {
			// Hide a random real letter
			let realLetterIndices = [];
			this.currentWordDisplay.forEach((letterObj, index) => {
				if (!letterObj.isDecoy && this.currentWord.root_word.toLowerCase().includes(letterObj.letter)) {
					realLetterIndices.push(index);
				}
			});
			if (realLetterIndices.length > 0) {
				this.hiddenLetterIndex = realLetterIndices[Math.floor(Math.random() * realLetterIndices.length)];
				// Reveal hidden letter at 40% through the round
				this.hiddenLetterRevealTime = this.roundDuration * 0.4;
			}
		}
	}
	
	setupLockCycles(){
		this.currentLockCycle = 0;
		this.lockCycleEndTimes = [];
		let totalTime = this.roundDuration;
		let cycleTime = totalTime / this.lockCycles;
		let reductionFactor = 1; // Each cycle is 90% of previous
		
		let currentTime = 0;
		for (let i = 0; i < this.lockCycles; i++) {
			currentTime += cycleTime;
			this.lockCycleEndTimes.push(currentTime);
			cycleTime *= reductionFactor;
		}
	}
	
	continueWords(){
		if (this.phase === GAME_PHASES.GAME_STOPPED || this.phase === GAME_PHASES.PRE_GAME) {
			this.startRound();
		}
	}

	pauseWords(data, player){
		if (this.phase === GAME_PHASES.IN_GAME) {
			this.clock.pause();
			this.phase = GAME_PHASES.GAME_STOPPED;
			emitGameState();
		}
	}

	resetWords(data, player) {
		this.reset(true);
		this.phase = GAME_PHASES.PRE_GAME;
		emitGameState();
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
		this.phase = GAME_PHASES.PRE_GAME;
		this.roundScore = 0;
		this.foundWords = [];
		this.clock.pause();
		this.clock.reset();
		emitGameState();
	}
}

class Leaderboard{
  constructor(){
    this.players = [];
  }
  
  updateScores(players, numShown = 10){
    // Sort by total score (descending), then by username
    let sortedPlayers = _.orderBy(
      players.filter(p => p.score > 0), 
      ["score", "username"], 
      ["desc", "asc"]
    );
    
    this.players = sortedPlayers.slice(0, numShown).map(player => ({
      username: player.username,
      platform: player.platform,
      score: player.score,
      roundScore: player.roundScore || 0
    }));
  }
  
  updateRoundScores(players, numShown = 10){
    // Sort by round score (descending), then by username
    let sortedPlayers = _.orderBy(
      players.filter(p => (p.roundScore || 0) > 0), 
      ["roundScore", "username"], 
      ["desc", "asc"]
    );
    
    return sortedPlayers.slice(0, numShown).map(player => ({
      username: player.username,
      platform: player.platform,
      score: player.roundScore || 0
    }));
  }

  clear(){
    this.players = [];
  }
  
  toJSON(){
    return this.players;
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
		this.processedCuePoints = new Set();
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
		this.processedCuePoints.clear();
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
		this.processedCuePoints.clear();
	}
	
	tick(){
		let now = Date.now();
		let timeDelta = now - this.prevTickTime
		let newElapsed = this.elapsed + timeDelta
		
		// Check cue points - handle both exact matches and when we pass the cue point time
		this.cuePoints.forEach(cue =>{
			let cueKey = `${cue.name}-${cue.time}`;
			if (!this.processedCuePoints.has(cueKey) && (this.elapsed === cue.time || (this.elapsed < cue.time && cue.time <= newElapsed))){
				// console.log("cue-point." + cue.name)
				this.processedCuePoints.add(cueKey);
				this.emit("cue-point." + cue.name);
			}
		})
		
		// Check for lock cycle transitions
		if (game.lockCycleEndTimes && game.lockCycleEndTimes.length > 0) {
			game.lockCycleEndTimes.forEach((endTime, index) => {
				if (this.elapsed < endTime && newElapsed >= endTime) {
					game.currentLockCycle = index + 1;
					// Unlock all players for new cycle
					game.players.forEach(player => {
						if (player.currentLockCycle < game.currentLockCycle) {
							player.isLocked = false;
						}
					});
					this.emit('lock-cycle-end', index + 1);
				}
			});
		}
		
		// Check for decoy reveal
		if (game.decoyRevealTime > 0 && this.elapsed < game.decoyRevealTime && newElapsed >= game.decoyRevealTime) {
			this.emit('decoy-reveal');
		}
		
		// Check for hidden letter reveal
		if (game.hiddenLetterRevealTime > 0 && this.elapsed < game.hiddenLetterRevealTime && newElapsed >= game.hiddenLetterRevealTime) {
			this.emit('hidden-reveal');
		}
		
		this.elapsed = newElapsed;
		// corrects for timeouts that take longer than the frequency wants to be
		let nextTickDelta = timeDelta < 5 ? this.tickFrequency : this.tickFrequency - (this.elapsed % this.tickFrequency)
		// console.log("nextTickDelta", nextTickDelta)
		this.prevTickTime = now;
		this.timerRef = setTimeout(() => this.tick(), nextTickDelta);
		if (this.duration <= this.elapsed){
			this.elapsed = this.duration;
			// Check cue points one more time in case we hit the duration exactly
			// (cue points at exactly the duration might not have been caught above)
			this.cuePoints.forEach(cue =>{
				let cueKey = `${cue.name}-${cue.time}`;
				if (!this.processedCuePoints.has(cueKey) && cue.time <= this.elapsed) {
					this.processedCuePoints.add(cueKey);
					this.emit("cue-point." + cue.name);
				}
			});
			// Don't pause immediately - let cue points process first
			// The 'end' event will be emitted, but we'll pause after a small delay
			// to ensure cue points are processed
			setTimeout(() => {
				this.emit('end');
				this.pause();
			}, 0);
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
// Load all-time scores after game is initialized
loadAllTimeScores();

let GAME_STATE = {
	game: game,
	leaderboard: leaderboard,
	runningLeaderboard: [],
	roundLeaderboard: [],
	allTimeLeaderboard: [],
	performanceStars: 0,
	roundTarget: 0,
	currentLevel: 0,
	modifiers: { hasDecoy: false, hasHidden: false },
	decoyLetterIndex: -1,
	hiddenLetterIndex: -1,
	decoyRevealed: false,
	hiddenRevealed: false,
	lockCycleEndTimes: [],
	currentLockCycle: 0,
	roundSuccess: false,
	timingConfig: TIMING_CONFIG // Include timing config for frontend synchronization
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
clock.on('cue-point.start-next-round', () => {
	// Backend triggers the next round automatically after post-game countdown
	game.progressLevel();
	game.startRound();
});
clock.on('cue-point.start-game-clock', () => {
	// Start the game clock after countdown finishes
	game.clock.start();
});
clock.on('cue-point.show-leaderboards', () => {
	// Trigger leaderboard display (handled on frontend via state update)
	emitGameState();
});

// ---------------------------------------------------------------------------


function setupIO(_socket, _io){
	io = _io;
	socket = _socket;

	socket.emit("words-game.state", GAME_STATE);

	socket.on("words-game.start", () => {
		game.start();
		console.log("words-game.start");
	})

	socket.on("words-game.pause", () => {
		game.pauseWords();
		console.log("words-game.pause");
	})

	socket.on("words-game.continue", () => {
		game.continueWords();
		console.log("words-game.continue");
	})

	socket.on("words-game.reset", () => {
		game.resetWords();
		console.log("words-game.reset");
	})

	socket.on("words-game.set-level", (level) => {
		level = Math.max(0, Math.min(9, parseInt(level) || 0));
		game.level = level;
		emitGameState();
		console.log("words-game.set-level", level);
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
	// Update running leaderboard (total scores)
	leaderboard.updateScores(game.players, 10);
	
	// Update round leaderboard (round scores only)
	let roundLeaderboard = leaderboard.updateRoundScores(game.players, 10);
	
	// Update all-time leaderboard
	let allTimeLeaderboard = Object.entries(game.allTimeScores)
		.map(([username, score]) => ({ username, score }))
		.sort((a, b) => b.score - a.score)
		.slice(0, 10);
	
	// Use performance stars calculated in endRound (or 0 if not set)
	// Update GAME_STATE with current leaderboard data
	GAME_STATE.runningLeaderboard = leaderboard.toJSON();
	GAME_STATE.roundLeaderboard = roundLeaderboard;
	GAME_STATE.allTimeLeaderboard = allTimeLeaderboard;
	GAME_STATE.performanceStars = game.performanceStars || 0;
	GAME_STATE.roundTarget = game.roundTarget;
	GAME_STATE.currentLevel = game.level;
	GAME_STATE.modifiers = game.getLevelModifiers();
	GAME_STATE.decoyLetterIndex = game.decoyLetterIndex;
	GAME_STATE.hiddenLetterIndex = game.hiddenLetterIndex;
	GAME_STATE.decoyRevealed = game.clock.elapsed >= game.decoyRevealTime;
	GAME_STATE.hiddenRevealed = game.clock.elapsed >= game.hiddenLetterRevealTime;
	GAME_STATE.lockCycleEndTimes = game.lockCycleEndTimes;
	GAME_STATE.currentLockCycle = game.currentLockCycle;
	GAME_STATE.roundSuccess = game.roundSuccess;
	
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

function loadAllTimeScores(){
	const dataDir = path.resolve(__dirname, "../..", "data");
	const scoresPath = path.resolve(dataDir, "all-time-scores.json");
	try {
		// Ensure data directory exists
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}
		
		if (fs.existsSync(scoresPath)) {
			const data = fs.readFileSync(scoresPath, 'utf8');
			game.allTimeScores = JSON.parse(data);
		} else {
			game.allTimeScores = {};
		}
	} catch (error) {
		console.error('Error loading all-time scores:', error);
		if (game) {
			game.allTimeScores = {};
		}
	}
}

function saveAllTimeScores(){
	const scoresPath = path.resolve(__dirname, "../..", "data", "all-time-scores.json");
	try {
		fs.writeFileSync(scoresPath, JSON.stringify(game.allTimeScores, null, 2), 'utf8');
	} catch (error) {
		console.error('Error saving all-time scores:', error);
	}
}

function updateAllTimeScores(players){
	players.forEach(player => {
		if (!game.allTimeScores[player.username]) {
			game.allTimeScores[player.username] = 0;
		}
		game.allTimeScores[player.username] = Math.max(
			game.allTimeScores[player.username],
			player.score
		);
	});
	saveAllTimeScores();
}

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