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

function onSocketConnect(){
	
	socket.on("words-game.state", gamedata => {
		// Show pre-game until game actually starts
		if (gamedata.game.phase === GAME_STATES.PRE_GAME || gamedata.game.phase === GAME_STATES.GAME_STOPPED) {
			if (!preGameShown) {
				$top.addClass("pre-game").removeClass("in-game post-game stopped");
				preGameShown = true;
			}
		} else if (gamedata.game.phase === GAME_STATES.IN_GAME) {
			// Hide pre-game when game starts (only if clock is running)
			if (preGameShown && gamedata.game.clock.isRunning) {
				preGameShown = false;
				// Show countdown before starting
				showCountdown(() => {
					$top.removeClass("pre-game").addClass("in-game");
				});
				return;
			} else if (!preGameShown && !gamedata.game.clock.isRunning && gamedata.game.round > 0 && !countdownActive) {
				// New round starting - show countdown
				showCountdown(() => {
					// Countdown complete, game will continue
				});
			}
		}
		
		if (!currentWord || currentWord.root_word != gamedata.game.currentWord.root_word){
			setupGame(gamedata);
		}
		updateGameState(gamedata);
	})
}

function showCountdown(callback) {
	if (countdownActive) return;
	countdownActive = true;
	
	let $overlay = $('.countdown-overlay');
	let $number = $overlay.find('.countdown-number');
	
	$overlay.addClass('active');
	
	let count = 3;
	$number.text(count);
	
	let countdownInterval = setInterval(() => {
		count--;
		if (count > 0) {
			$number.text(count);
			// Animate
			gsap.fromTo($number, 
				{ scale: 0, opacity: 0 },
				{ scale: 1, opacity: 1, duration: 0.3 }
			);
		} else {
			clearInterval(countdownInterval);
			$number.text('GO!');
			gsap.fromTo($number,
				{ scale: 0, opacity: 0 },
				{ 
					scale: 1, opacity: 1, duration: 0.3,
					onComplete: () => {
						setTimeout(() => {
							$overlay.removeClass('active');
							countdownActive = false;
							if (callback) callback();
						}, 500);
					}
				}
			);
		}
	}, 1000);
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
	let tl = gsap.timeline();
	let $letters = $rootWord.find('.letter-holder');
	_.forEach($letters, (el, i) =>{
		tl.to(el, {x: -100, duration: 0.5, ease: "power2.inOut"}, i * 0.05)
	})
	// on animation complete
	tl.then(() => {

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
			
			gsap.to(el, {
				x: 0,
				duration: 0
			})
		})
		// reset main and alt letter positions
	})
	tl.play();
}

function updateLeaderboard(gamedata){
	// Show interstitial first if in post-game
	if (gamedata.game.phase === GAME_STATES.POST_GAME) {
		// Check if we should show leaderboards (after 5 seconds)
		if (gamedata.game.clock.elapsed >= 5000) {
			// Hide interstitial and show leaderboards
			$('.interstitial').hide();
			showLeaderboards(gamedata);
		} else {
			// Show interstitial
			showInterstitial(gamedata);
		}
	} else {
		// Update all three leaderboards
		updateLeaderboardDisplay('.running-leaderboard', gamedata.runningLeaderboard || []);
		updateLeaderboardDisplay('.round-leaderboard', gamedata.roundLeaderboard || []);
		updateLeaderboardDisplay('.all-time-leaderboard', gamedata.allTimeLeaderboard || []);
		
		// Don't update next round info when not in post-game phase
		// (it will be updated when we enter post-game)
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
	
	// Animate in
	gsap.fromTo($interstitial, 
		{ opacity: 0, scale: 0.8 },
		{ opacity: 1, scale: 1, duration: 0.5 }
	);
	
	// Hide after 5 seconds and show leaderboards (triggered by clock cue point)
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
	
	// Clear any existing interval
	if (countdownInterval) {
		clearInterval(countdownInterval);
		countdownInterval = null;
	}
	
	// Only update next round info when in post-game phase
	if (gamedata.game.phase !== GAME_STATES.POST_GAME) {
		$countdown.hide();
		$gameOver.hide();
		return;
	}
	
	// Only show countdown if round was successful (which means there will be a next round)
	// If roundSuccess is false, the game is over and won't auto-start
	if (gamedata.roundSuccess === true) {
		$gameOver.hide();
		// Start countdown from 10
		let countdown = 10;
		$countdown.text(`Next round in ${countdown}...`).show();
		
		countdownInterval = setInterval(() => {
			countdown--;
			if (countdown > 0) {
				$countdown.text(`Next round in ${countdown}...`);
			} else {
				clearInterval(countdownInterval);
				countdownInterval = null;
				$countdown.text('Starting next round...');
			}
		}, 1000);
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