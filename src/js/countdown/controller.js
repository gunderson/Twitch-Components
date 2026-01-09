window.addEventListener('DOMContentLoaded', () => {
	console.log('countdown controller loaded', !!io);
	
	let $setButton = $('button.set-clock')
	let $runButton = $('button.run')
	let $pauseButton = $('button.pause')
	let $quickSetButton = $('button.quick-set')
	let $hours = $('.clock input.hours')
	let $minutes = $('.clock input.minutes')
	let $seconds = $('.clock input.seconds')
	let clockState = null;

	$setButton.on('click', () => {
		const displayTime = {
			hours: parseInt($hours.val()), 
			minutes: parseInt($minutes.val()), 
			seconds: parseInt($seconds.val())
		}
		let milliseconds = 1000 * (displayTime.seconds + (60 * displayTime.minutes) + (60*60*displayTime.hours));
		socket.emit('countdown.set-duration', milliseconds);
		console.log('countdown.set-duration', milliseconds);
	});

	$quickSetButton.on('click', () => {
		$hours.val(0);
		$minutes.val(7);
		$seconds.val(30);
		
		const displayTime = {
			hours: parseInt($hours.val()), 
			minutes: parseInt($minutes.val()), 
			seconds: parseInt($seconds.val())
		}
		let milliseconds = 1000 * (displayTime.seconds + (60 * displayTime.minutes) + (60*60*displayTime.hours));
		socket.emit('countdown.set-duration', milliseconds);
		console.log('countdown.set-duration', milliseconds);
	})

	$runButton.on('click', () => {
		socket.emit('countdown.run');
	});
	$pauseButton.on('click', () => {
		socket.emit('countdown.stop');
	});

	socket.on('countdown.state', (state) => {
		console.log("countdown.state", state)
		clockState = state;
		let timeRemaining = state.duration - state.elapsed;
		if (timeRemaining <= 0) timeRemaining = 0;
		let displayTime = parseMilliseconds(timeRemaining);
		
		$hours.val(displayTime.hours.toString().padStart(2, '0'));
		$minutes.val(displayTime.minutes.toString().padStart(2, '0'));
		$seconds.val(displayTime.seconds.toString().padStart(2, '0'));

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
