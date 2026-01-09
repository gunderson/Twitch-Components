// connect to server
let socket = io();
const GAME_STATES = {
	IN_GAME: "IN_GAME",
	PRE_GAME: "PRE_GAME",
	POST_GAME: "POST_GAME",
	GAME_STOPPED: "GAME_STOPPED",
	GAME_OVER: "GAME_OVER"
}
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

function onSocketConnect(){
	
	socket.on("words-game.state", gamedata => {
		if (!currentWord || currentWord.root_word != gamedata.game.currentWord.root_word){
			setupGame(gamedata);
		}
		updateGameState(gamedata);
	})
}

function updateGameState(gamedata){
	updateFoundWords(gamedata)
	updateClock(gamedata.game.clock)
	updateCurrentWord(gamedata)
	changeGamePhase(gamedata)
}

function updateFoundWords(gamedata){
	
	// console.log(gamedata);

	gamedata.game.foundWords.forEach(wordData => {
		$subword = $subwords.find(`[data-word="${wordData.word}"]`);
		$subword.addClass('found');
		$subword.find('.player-name')
			.addClass('locked found')
			.text(wordData.player.username)
	})
}

function updateClock(clock){
	let percentComplete = clock.elapsed / clock.duration;
	$('.clock .indicator').css(
		{
			width: (100*percentComplete) + "%"
		}
	)
}

function updateCurrentWord(gamedata){
	currentWord = gamedata.game.currentWord;
	// console.log(_.isEqual(currentWordDisplay, gamedata.game.currentWordDisplay), currentWordDisplay, gamedata.game.currentWordDisplay);
	if (_.isEqual(currentWordDisplay, gamedata.game.currentWordDisplay)) return;
	$rootWord = $(".root-word")
	currentWordDisplay = gamedata.game.currentWordDisplay;
	$rootWord.find(".alt-letter .letter-text").each((i, el) => $(el).text(currentWordDisplay[i]));

	// animate alt letters in
	let tl = gsap.timeline();
	let $letters = $rootWord.find('.letter-holder');
	_.forEach($letters, (el, i) =>{
		tl.to(el, {x: -100, duration: 0.5, ease: "power2.inOut"}, i * 0.05)
	})
	// on animation complete
	tl.then(() => {

		// change main letter text to alt
		$letters.each((i, el) => {
			$main = $(el).find('.main-letter .letter-text');
			$alt = $(el).find('.alt-letter .letter-text');
			$main.text($alt.text());
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

}

function setupGame(gamedata){
	currentWordDisplay = gamedata.game.currentWordDisplay;
	let $rootWordLetterElements = _.map(currentWordDisplay, letter => {
		$el = $rootWordLetterTemplate.clone().removeClass("template");
		$el.find(".main-letter .letter-text").text(letter);
		// $el.find(".alt-letter").text(letter);
		return $el
	})

	$rootWord.empty().append($rootWordLetterElements);
	$rootWord.css({
		width:"auto",
		display:"inline-block"
	})
	$rootWord.css({
		width:$rootWord.width(),
		display:"block"
	})
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
		]).addClass("stopped");
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