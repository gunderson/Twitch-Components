const GAME_STATES = {
	IN_GAME: "IN_GAME",
	POST_GAME: "POST_GAME",
	GAME_STOPPED: "GAME_STOPPED"
}

window.addEventListener('DOMContentLoaded', () => {
	console.log('words-game controller loaded');
	
	// Ensure socket is available
	if (typeof io === 'undefined') {
		console.error('Socket.io not loaded');
		return;
	}
	
	let socket = io();

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
	let $continueGameButton = $(".words-game button#continue-game")
	let $levelInput = $('#level-input')
	let $setLevelButton = $('#set-level')
	let $currentLevelDisplay = $('.current-level-display .level-value')

	$startGameButton.on('click', () => {
		socket.emit("words-game.start");
	})

	$pauseGameButton.on('click', () => {
		socket.emit("words-game.pause");
	})

	$continueGameButton.on('click', () => {
		socket.emit("words-game.continue");
	})

	$resetGameButton.on('click', () => {
		socket.emit("words-game.reset");
	})

	$selectRandomWordButton.on('click', selectRandomWord);

	$setLevelButton.on('click', () => {
		let level = parseInt($levelInput.val()) || 0;
		level = Math.max(0, Math.min(9, level));
		socket.emit("words-game.set-level", level);
	})

	$wordsList.on('change', event => {
        selectedWord = $wordsList.val();
		if (!selectedWord) return;
        socket.emit('select-word', selectedWord);
    });

	socket.on("words-game.state", (gamedata) => {
		changeGamePhase(gamedata);
		updateClock(gamedata);
		updateCurrentWord(gamedata);
		updateLevelDisplay(gamedata);
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
		let wordChanged = !currentWord || currentWord.root_word != gamedata.game.currentWord.root_word;
		
		if (wordChanged) {
			currentWord = {
				root_word: gamedata.game.currentWord.root_word,
				subWords: [...gamedata.game.currentWord.subwords]
			};
			$(".words-game .current-word").text(gamedata.game.currentWord.root_word);
		}
		
		let $subWords = $(".words-game .current-sub-words");
		
		// Update found words status
		let foundWords = gamedata.game.foundWords.map(fw => fw.word);
		
		// Clear and rebuild sub-words display
		$subWords.empty();
		
		// Sort words by length, then alphabetically
		let sortedWords = [...gamedata.game.currentWord.subwords].sort((a, b) => {
			if (a.length !== b.length) return a.length - b.length;
			return a.localeCompare(b);
		});
		
		sortedWords.forEach(word => {
			let isFound = foundWords.includes(word);
			let $wordDiv = $(`<div class="sub-word-item ${isFound ? 'found' : ''}">${word}</div>`);
			if (isFound) {
				let foundData = gamedata.game.foundWords.find(fw => fw.word === word);
				if (foundData && foundData.player) {
					$wordDiv.append(`<span class="found-by"> - ${foundData.player.username}</span>`);
				}
			}
			$subWords.append($wordDiv);
		});
	}

	function updateLevelDisplay(gamedata){
		if (gamedata.currentLevel !== undefined) {
			$currentLevelDisplay.text(gamedata.currentLevel);
			$levelInput.val(gamedata.currentLevel);
		}
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