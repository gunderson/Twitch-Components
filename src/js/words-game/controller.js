const GAME_STATES = {
	IN_GAME: "IN_GAME",
	POST_GAME: "POST_GAME",
	GAME_STOPPED: "GAME_STOPPED"
}

window.addEventListener('DOMContentLoaded', () => {
	console.log('words-game controller loaded');

	let currentWord = {
		root_word: "",
		subWords: []
	};

	let $top = $('section.words-game');
	let $selectRandomWordButton = $('button#random-word')
	let $wordsList = $('select#words-list')
	let $resetGameButton = $(".words-game button#reset-game")
	let $startGameButton = $(".words-game button#start-game")
	let $pauseGameButton = $(".words-game button#pause-game")
	// TODO: add change events

	$startGameButton.on('click', () => {
		socket.emit("words-game.start");
	})

	$selectRandomWordButton.on('click', selectRandomWord);

	$wordsList.on('change', event => {
        selectedWord = $wordsList.val();
		if (!selectedWord) return;
        socket.emit('select-word', selectedWord);
    });

	socket.on("words-game.state", (gamedata) => {
		changeGamePhase(gamedata);
		updateClock(gamedata);
		updateCurrentWord(gamedata);
		console.log("words-game.state", gamedata);
	})

    socket.on('words-list', setupWords);
    socket.on('selected-word', wordData => {
		console.log("selected-word", wordData);
		// deselect all
		$wordsList[0].selectedIndex = -1;
		$wordsList.find(`option#word-${wordData.root_word}`).prop('selected', true);
		// select word option
	});

	socket.emit('get-words-list');

	function changeGamePhase(gamedata){
		if (gamedata.game.phase == GAME_STATES.GAME_STOPPED){
			$top.removeClass([
				"in-game",
				"post-game"
			]).addClass("stopped");
		}
		if (gamedata.game.phase == GAME_STATES.IN_GAME){
			$top.removeClass([
				"stopped",
				"post-game"
			]).addClass("in-game");
		}
		if (gamedata.game.phase == GAME_STATES.POST_GAME){
			$top.removeClass([
				"stopped",
				"in-game"
			]).addClass("post-game");
		}
	}

	
	function updateClock(gamedata){}
	function updateCurrentWord(gamedata){
		if (currentWord && currentWord.root_word == gamedata.game.currentWord.root_word) return;
		$(".words-game .current-word").text(gamedata.game.currentWord.root_word)
		let $subWords = $(".words-game .current-sub-words");
		$subWords.empty();
		gamedata.game.currentWord.subwords.forEach(word => {
			$subWords.append(`<div>${word}</div>`);
		})
	}

	function getWords(){
		socket.emit('get-words-list');
	}
	
	function setupWords(wordListData){
		
		let $elements = wordListData.map(word => {
			return $(`<option id='word-${word.root_word}' name='${word.root_word}'>${word.root_word}</option>`)
		})
		$wordsList.append($elements)
	}
	
	function selectRandomWord(){
		console.log("selectRandomWord");
        socket.emit('select-random-word');
	}

	function onSelectWord(){

	}
})