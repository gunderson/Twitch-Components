let socket;

document.addEventListener('DOMContentLoaded', () => {
	socket = io()

	console.log('countdown controller loaded', !!io);
	
	let $setButton = $('button.set-clock')
	let $runPauseButton = $('button.run-pause')
	let $hours = $('.clock .hours')
	let $minutes = $('.clock .minutes')
	let $seconds = $('.clock .seconds')
	let clockState = null;

	$setButton.on('click', () => {
		const displayTime = {
			hours: parseInt($hours.text()), 
			minutes: parseInt($minutes.text()), 
			seconds: parseInt($seconds.text())
		}
		let milliseconds = 1000 * (displayTime.seconds + (60 * displayTime.minutes) + (60*60*displayTime.hours));
		socket.emit('countdown.set-duration', milliseconds);
		console.log('countdown.set-duration', milliseconds);
	});

	$runPauseButton.on('click', () => {
		socket.emit('countdown.run');
	});

	socket.on('countdown.state', (state) => {
		clockState = state;
		let timeRemaining = state.duration - state.elapsed;
		if (timeRemaining <= 0) timeRemaining = 0;
		let displayTime = parseMilliseconds(timeRemaining);
		
		$hours.text(displayTime.hours.toString().padStart(2, '0'));
		$minutes.text(displayTime.minutes.toString().padStart(2, '0'));
		$seconds.text(displayTime.seconds.toString().padStart(2, '0'));

		if (state.isRunning){
			// make button pause
			// set time & disable inputs
		} else {
			// make button run 
			// enable inputs
		}
	});
})

function parseMilliseconds(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  const milliseconds = ms % 1000;

  return { hours, minutes, seconds, milliseconds };
}
