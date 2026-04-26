// connect to server
let socket = io();
const GAME_STATES = {
	IN_GAME: "IN_GAME",
	PRE_GAME: "PRE_GAME",
	POST_GAME: "POST_GAME",
	GAME_STOPPED: "GAME_STOPPED",
	GAME_OVER: "GAME_OVER"
}

const GAME_PHASES = GAME_STATES; // Alias for compatibility

// Scrabble letter values (for backwards compatibility)
const LETTER_SCORES = {
  a:1, b:3, c:3, d:2, e:1,
  f:4, g:2, h:4, i:1, j:8,
  k:5, l:1, m:3, n:1, o:1,
  p:3, q:10, r:1, s:1, t:1,
  u:1, v:4, w:4, x:8, y:4,
  z:10
};
// determine if we're in OBS

let $top = $("body");
let $rootWord = $(".root-word")
let $subwords = $(".sub-words");
let $rootWordLetterTemplate = $(".root-word .letter.template")
let $subwordTemplate = $(".sub-words .template");

let currentWord = null
let currentWordDisplay = [];

// setup listeners
socket.on("connect", onSocketConnect);

let countdownActive = false;
let preGameShown = false;
let countdownInterval = null;

// Show pre-game on initial load
$top.addClass("pre-game").removeClass("in-game post-game stopped");
preGameShown = true;

// Track previous phase to detect transitions
let previousPhase = null;

function onSocketConnect(){
	
	socket.on("words-game.state", gamedata => {
		const currentPhase = gamedata.game.phase;
		const phaseChanged = previousPhase !== currentPhase;
		previousPhase = currentPhase;
		
		// Show pre-game until game actually starts
		if (currentPhase === GAME_STATES.PRE_GAME || currentPhase === GAME_STATES.GAME_STOPPED) {
			if (!preGameShown) {
				$top.addClass("pre-game").removeClass("in-game post-game stopped");
				preGameShown = true;
			}
		} else if (currentPhase === GAME_STATES.IN_GAME) {
			// Transitioning from post-game or pre-game to in-game
			if (phaseChanged && (previousPhase === GAME_STATES.POST_GAME || previousPhase === GAME_STATES.PRE_GAME)) {
				preGameShown = false;
				$top.removeClass("pre-game post-game").addClass("in-game");
				// Show countdown before starting (using timing config from backend)
				if (!countdownActive) {
					showCountdown(() => {
						// Countdown complete, game will continue (backend handles scene triggering)
					}, gamedata.timingConfig);
				}
				return;
			} else if (!gamedata.game.clock.isRunning && gamedata.game.round > 0 && !countdownActive) {
				// New round starting - show countdown (using timing config from backend)
				showCountdown(() => {
					// Countdown complete, game will continue (backend handles scene triggering)
				}, gamedata.timingConfig);
			}
		} else if (currentPhase === GAME_STATES.POST_GAME) {
			// Ensure we're showing post-game phase
			$top.removeClass("pre-game in-game").addClass("post-game");
		}
		
		if (!currentWord || currentWord.root_word != gamedata.game.currentWord.root_word){
			setupGame(gamedata);
		}
		updateGameState(gamedata);
	})
}

function showCountdown(callback, timingConfig) {
	if (countdownActive) return;
	countdownActive = true;
	
	// Use timing config from backend, or fallback to defaults
	const config = timingConfig?.preRoundCountdown || {
		duration: 3000,
		numberDuration: 1000,
		goDuration: 500,
		animationDuration: 300
	};
	
	let $overlay = $('.countdown-overlay');
	let $number = $overlay.find('.countdown-number');
	
	$overlay.addClass('active');
	
	// Calculate count based on numberDuration
	let count = Math.floor(config.duration / config.numberDuration) - 1; // Subtract 1 for "GO!"
	$number.text(count);
	
	let countdownInterval = setInterval(() => {
		count--;
		if (count > 0) {
			$number.text(count);
			// Animate using timing config
			gsap.fromTo($number, 
				{ scale: 0, opacity: 0 },
				{ scale: 1, opacity: 1, duration: config.animationDuration / 1000 }
			);
		} else {
			clearInterval(countdownInterval);
			$number.text('GO!');
			gsap.fromTo($number,
				{ scale: 0, opacity: 0 },
				{ 
					scale: 1, opacity: 1, duration: config.animationDuration / 1000,
					onComplete: () => {
						setTimeout(() => {
							$overlay.removeClass('active');
							countdownActive = false;
							if (callback) callback();
						}, config.goDuration);
					}
				}
			);
		}
	}, config.numberDuration);
}

function updateGameState(gamedata){
	updateFoundWords(gamedata)
	updateClock(gamedata.game.clock, gamedata)
	updateCurrentWord(gamedata)
	updateRoundInfo(gamedata)
	updateModifiers(gamedata)
	updateLeaderboard(gamedata)
	changeGamePhase(gamedata)
}

function updateFoundWords(gamedata){
	
	// console.log(gamedata);

	gamedata.game.foundWords.forEach(wordData => {
		$subword = $subwords.find(`[data-word="${wordData.word}"]`);
		$subword.addClass('found');
		let $playerName = $subword.find('.player-name');
		$playerName.empty().addClass('found');
		
		// Add platform indicator
		let platform = wordData.player.platform || '';
		let platformIcon = platform === 'youtube' ? '📺' : platform === 'twitch' ? '🎮' : '';
		if (platformIcon) {
			$playerName.append(`<span class="platform-icon">${platformIcon}</span> `);
		}
		
		// Add player name
		$playerName.append(wordData.player.username);
		
		// Add lock icon if player is locked
		if (wordData.player.isLocked) {
			$playerName.append('<span class="lock-icon">🔒</span>');
		}
	})
}

function updateClock(clock, gamedata){
	let percentComplete = clock.elapsed / clock.duration;
	// Clock shrinks from right to left
	$('.clock .indicator').css({
		width: (100 * (1 - percentComplete)) + "%",
		right: 0,
		left: "auto"
	});
	
	// Update lock cycle markers
	updateLockCycleMarkers(clock, gamedata);
	
	// Check for decoy/hidden reveals
	if (gamedata.decoyRevealed && gamedata.decoyLetterIndex >= 0) {
		revealDecoyLetter(gamedata.decoyLetterIndex);
	}
	if (gamedata.hiddenRevealed && gamedata.hiddenLetterIndex >= 0) {
		revealHiddenLetter(gamedata.hiddenLetterIndex);
	}
}

function updateLockCycleMarkers(clock, gamedata){
	let $markers = $('.clock .lock-cycle-markers');
	$markers.empty();
	
	if (gamedata.lockCycleEndTimes && gamedata.lockCycleEndTimes.length > 0) {
		gamedata.lockCycleEndTimes.forEach((endTime, index) => {
			if (index < gamedata.lockCycleEndTimes.length - 1) { // Don't mark final cycle
				// Position from right side (since clock shrinks from right)
				let position = (endTime / clock.duration) * 100;
				let $marker = $('<div class="lock-marker"></div>');
				$marker.css('left', position + '%');
				$markers.append($marker);
			}
		});
	}
}

function revealDecoyLetter(index){
	$('.root-word .letter').eq(index).addClass('decoy');
}

function revealHiddenLetter(index){
	$('.root-word .letter').eq(index).removeClass('hidden');
}

function updateRoundInfo(gamedata){
	$('.level-value').text(gamedata.currentLevel || 0);
	$('.current-score').text(gamedata.game.roundScore || 0);
	$('.target-score').text(gamedata.roundTarget || 0);
}

function updateModifiers(gamedata){
	let $modifiers = $('.modifiers-display');
	$modifiers.empty();
	
	if (gamedata.modifiers) {
		let modifiers = [];
		if (gamedata.modifiers.hasDecoy) modifiers.push('Decoy Letter');
		if (gamedata.modifiers.hasHidden) modifiers.push('Hidden Letter');
		
		if (modifiers.length > 0) {
			$modifiers.text('Modifiers: ' + modifiers.join(', '));
		}
	}
}

function updateCurrentWord(gamedata){
	currentWord = gamedata.game.currentWord;
	// Deep comparison for letter objects
	let newDisplay = gamedata.game.currentWordDisplay;
	if (_.isEqual(currentWordDisplay, newDisplay)) return;
	$rootWord = $(".root-word")
	currentWordDisplay = newDisplay;
	
	// Update alt letters with new letter and value
	$rootWord.find(".alt-letter").each((i, el) => {
		let letterObj = currentWordDisplay[i];
		let letter = typeof letterObj === 'string' ? letterObj : letterObj.letter;
		let value = typeof letterObj === 'string' ? (LETTER_SCORES[letter.toLowerCase()] || 0) : letterObj.value;
		let isHidden = gamedata.hiddenLetterIndex === i && !gamedata.hiddenRevealed;
		let isDecoy = letterObj.isDecoy || gamedata.decoyLetterIndex === i;
		
		$(el).find('.letter-text').text(isHidden ? '?' : letter);
		$(el).find('.value').text(isHidden ? '?' : value);
		
		// Update classes
		if (isDecoy && gamedata.decoyRevealed) {
			$(el).parent().addClass('decoy');
		}
		if (isHidden) {
			$(el).parent().addClass('hidden');
		}
	});

	// animate alt letters in
	let tl = gsap.timeline({
		onComplete: () => {
			// change main letter text and value to alt
			$letters.each((i, el) => {
				let $main = $(el).find('.main-letter');
				let $alt = $(el).find('.alt-letter');
				$main.find('.letter-text').text($alt.find('.letter-text').text());
				$main.find('.value').text($alt.find('.value').text());
				
				// Copy classes from parent
				if ($(el).parent().hasClass('decoy')) {
					$(el).addClass('decoy');
				}
				if ($(el).parent().hasClass('hidden')) {
					$(el).addClass('hidden');
				}
				
				gsap.set(el, {x: 0});
			});
			// reset main and alt letter positions
		}
	});
	let $letters = $rootWord.find('.letter-holder');
	_.forEach($letters, (el, i) =>{
		tl.to(el, {x: -100, duration: 0.5, ease: "power2.inOut"}, i * 0.05);
	});
}

// Track post-game state to show interstitial only once
let postGameInterstitialShown = false;
let postGameLeaderboardsShown = false;
let postGamePhase = null;

function updateLeaderboard(gamedata){
	// Show interstitial first if in post-game
	if (gamedata.game.phase === GAME_STATES.POST_GAME) {
		// Use timing config from backend for interstitial duration
		const timingConfig = gamedata.timingConfig?.postGame || { interstitialDuration: 5000 };
		const interstitialDuration = timingConfig.interstitialDuration;
		
		// Reset flags if we just entered post-game
		if (postGamePhase !== GAME_STATES.POST_GAME) {
			postGameInterstitialShown = false;
			postGameLeaderboardsShown = false;
			postGamePhase = GAME_STATES.POST_GAME;
			// Clear any existing countdown interval when entering post-game
			if (countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
		}
		
		// Check if we should show leaderboards (after interstitial duration)
		const elapsed = gamedata.game.clock.elapsed || 0;
		if (elapsed >= interstitialDuration) {
			// Hide interstitial
			$('.interstitial').css('display', 'none');
			// Only call showLeaderboards once when transitioning to leaderboard phase
			if (!postGameLeaderboardsShown) {
				showLeaderboards(gamedata);
				postGameLeaderboardsShown = true;
			}
			// Update countdown info continuously while showing leaderboards
			// This will be called on every state update, so countdown will update
			updateNextRoundInfo(gamedata);
		} else {
			// Show interstitial immediately when entering post-game
			if (!postGameInterstitialShown) {
				showInterstitial(gamedata);
				postGameInterstitialShown = true;
			} else {
				// Keep interstitial visible during interstitial phase
				$('.interstitial').show();
			}
			// Don't show countdown during interstitial phase - it will show during leaderboard phase
			updateNextRoundInfo(gamedata);
		}
	} else {
		// Reset post-game tracking when leaving post-game
		if (postGamePhase === GAME_STATES.POST_GAME) {
			postGameInterstitialShown = false;
			postGameLeaderboardsShown = false;
			postGamePhase = null;
			$('.interstitial').hide();
		}
		// Update all three leaderboards
		updateLeaderboardDisplay('.running-leaderboard', gamedata.runningLeaderboard || []);
		updateLeaderboardDisplay('.round-leaderboard', gamedata.roundLeaderboard || []);
		updateLeaderboardDisplay('.all-time-leaderboard', gamedata.allTimeLeaderboard || []);
	}
}

function showInterstitial(gamedata){
	let $interstitial = $('.interstitial');
	let $performanceRating = $interstitial.find('.performance-rating');
	let $stars = $performanceRating.find('.stars');
	let $title = $performanceRating.find('.title');
	
	$stars.empty();
	
	// If round failed, show "Game Over" instead of stars
	if (!gamedata.roundSuccess) {
		$title.text('Game Over');
		$stars.hide();
	} else {
		$title.text('Performance');
		$stars.show();
		// Show performance stars
		let stars = gamedata.performanceStars || 0;
		for (let i = 0; i < 5; i++) {
			let $star = $('<span class="star">⭐</span>');
			if (i < stars) {
				$star.addClass('active');
			}
			$stars.append($star);
		}
	}
	
	// Show and animate in
	$interstitial.show();
	gsap.fromTo($interstitial, 
		{ opacity: 0, scale: 0.8 },
		{ opacity: 1, scale: 1, duration: 0.5 }
	);
	
	// Hide after interstitial duration and show leaderboards (triggered by clock cue point)
	// The clock will handle the timing via cue points
}

function showLeaderboards(gamedata){
	updateLeaderboardDisplay('.running-leaderboard', gamedata.runningLeaderboard || []);
	updateLeaderboardDisplay('.round-leaderboard', gamedata.roundLeaderboard || []);
	updateLeaderboardDisplay('.all-time-leaderboard', gamedata.allTimeLeaderboard || []);
	
	// Animate in each leaderboard name
	$('.leaderboard .player:not(.template)').each((index, el) => {
		gsap.fromTo(el,
			{ opacity: 0, x: -50 },
			{ opacity: 1, x: 0, duration: 0.3, delay: index * 0.1 }
		);
	});
	
	updateNextRoundInfo(gamedata);
}

function updateNextRoundInfo(gamedata){
	let $countdown = $('.next-round-info .countdown-text');
	let $gameOver = $('.next-round-info .game-over-text');
	
	// Only update next round info when in post-game phase
	if (gamedata.game.phase !== GAME_STATES.POST_GAME) {
		// Clear any existing interval when leaving post-game
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
		$countdown.hide();
		$gameOver.hide();
		return;
	}
	
	// Only show countdown if round was successful (which means there will be a next round)
	// If roundSuccess is false, the game is over and won't auto-start
	if (gamedata.roundSuccess === true) {
		$gameOver.hide();
		
		// Use timing config from backend for countdown duration
		const timingConfig = gamedata.timingConfig?.postGame || { interstitialDuration: 5000, leaderboardDuration: 10000, totalDuration: 15000 };
		const interstitialDuration = timingConfig.interstitialDuration || 5000;
		const totalDuration = timingConfig.totalDuration || (interstitialDuration + (timingConfig.leaderboardDuration || 10000));
		
		// Calculate remaining time until next round starts based on actual clock elapsed
		// The clock.elapsed is updated by the backend on each tick
		const elapsed = gamedata.game.clock.elapsed || 0;
		const remaining = Math.max(0, Math.ceil((totalDuration - elapsed) / 1000));
		
		// Only show countdown during leaderboard phase (after interstitial)
		if (elapsed >= interstitialDuration) {
			// Update countdown text based on remaining time from backend clock
			// This will update on each state update from the backend
			if (remaining > 0) {
				$countdown.text(`Next round in ${remaining}...`).show();
			} else {
				$countdown.text('Starting next round...').show();
				// Backend will automatically trigger the next round via cue point at totalDuration
			}
		} else {
			// During interstitial phase, hide countdown
			$countdown.hide();
		}
	} else {
		// Game is over - hide countdown and show game over message
		$countdown.hide();
		$gameOver.text('Game Over').show();
	}
}

function updateLeaderboardDisplay(selector, leaderboardData){
	let $leaderboard = $(selector);
	let $template = $leaderboard.find('.player.template');
	
	// Clear existing players (except template)
	$leaderboard.find('.player:not(.template)').remove();
	
	// Add players from leaderboard data
	leaderboardData.forEach((playerData, index) => {
		let $player = $template.clone().removeClass('template');
		let $name = $player.find('.name');
		$name.text(playerData.username);
		
		// Add platform indicator
		let platform = playerData.platform || '';
		let platformIcon = platform === 'youtube' ? '📺' : platform === 'twitch' ? '🎮' : '';
		if (platformIcon) {
			$name.prepend(`<span class="platform-icon">${platformIcon}</span> `);
		}
		
		$player.find('.score').text(playerData.score);
		$player.attr('data-rank', index + 1);
		$leaderboard.append($player);
	});
	
	// Note: Visibility is controlled by CSS based on game phase (post-game)
	// The leaderboard will automatically show/hide based on body.post-game class
}

function setupGame(gamedata){
	currentWordDisplay = gamedata.game.currentWordDisplay;
	let $rootWordLetterElements = _.map(currentWordDisplay, (letterObj, index) => {
		$el = $rootWordLetterTemplate.clone().removeClass("template");
		let letter = typeof letterObj === 'string' ? letterObj : letterObj.letter;
		let value = typeof letterObj === 'string' ? (LETTER_SCORES[letter.toLowerCase()] || 0) : letterObj.value;
		let isHidden = gamedata.hiddenLetterIndex === index && !gamedata.hiddenRevealed;
		let isDecoy = letterObj.isDecoy || gamedata.decoyLetterIndex === index;
		
		$el.find(".main-letter .letter-text").text(isHidden ? '?' : letter);
		$el.find(".main-letter .value").text(isHidden ? '?' : value);
		$el.find(".alt-letter .letter-text").text(isHidden ? '?' : letter);
		$el.find(".alt-letter .value").text(isHidden ? '?' : value);
		
		if (isDecoy && gamedata.decoyRevealed) {
			$el.addClass('decoy');
		}
		if (isHidden) {
			$el.addClass('hidden');
		}
		
		return $el
	})

	$rootWord.empty().append($rootWordLetterElements);
	
	// Force a reflow to ensure elements are rendered before measuring
	$rootWord[0].offsetHeight;
	
	// Set width only if we have elements
	if ($rootWordLetterElements.length > 0) {
		$rootWord.css({
			width:"auto",
			display:"inline-block"
		});
		// Get the actual width after rendering
		let actualWidth = $rootWord.width();
		if (actualWidth > 0) {
			$rootWord.css({
				width: actualWidth + "px",
				display:"block"
			});
		} else {
			// Fallback: use auto if width is still 0
			$rootWord.css({
				width:"auto",
				display:"block"
			});
		}
	}
	
	// render the sub-words
	$subwords.empty();

	// order the words by length then by alpha
	let subwords = _.orderBy(
		gamedata.game.currentWord.subwords,
		[w => w.length, w => w.toLowerCase()],
		["asc", "asc"]
	);

	subwords.forEach(word => {
		// let $el = $subwordTemplate.clone().removeClass("template");
		// $el.find('.sub-word').text(word).data("word",word);
		let subWordHTML =  getSubWordHTML(word);
		let $subWord = $(subWordHTML);
		$subwords.append(subWordHTML);
	})
}

function changeGamePhase(gamedata){	
	if (gamedata.game.phase == GAME_STATES.PRE_GAME){
		$top.removeClass([
			"in-game",
			"post-game",
			"stopped"
		]).addClass("pre-game");
	}
	if (gamedata.game.phase == GAME_STATES.GAME_STOPPED){
		$top.removeClass([
			"in-game",
			"post-game",
			"pre-game"
		]).addClass("stopped");
	}
	if (gamedata.game.phase == GAME_STATES.IN_GAME){
		$top.removeClass([
			"stopped",
			"post-game",
			"pre-game"
		]).addClass("in-game");
	}
	if (gamedata.game.phase == GAME_STATES.POST_GAME){
		$top.removeClass([
			"stopped",
			"in-game",
			"pre-game"
		]).addClass("post-game");
	}
}


// templates


function getSubWordHTML(word){
	let lettersHTML = word.split("")
		.map((letter) => `<div class="letter">${letter}</div>`)
		.join("");

	let wordHTML = `
		<div class="sub-word" data-word="${word}">
			<div class="player-name"></div>
			<div class="letters">${lettersHTML}</div>
		</div>`;
	return wordHTML;
}