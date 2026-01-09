
const fs = require('fs');
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { StreamerbotClient } = require('@streamerbot/client');
const sass = require('sass');
const pug = require('pug');
const _ = require('lodash');

``
let settings = {
	playername: "Cresquin",
	pageDepth: 10,
	httpPort: 3033
}


// start http & socket servers

const streamerBotSocket = new StreamerbotClient();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// import component services
const RiskRankService = require('./js/risk-rank/service');
const CountdownService = require('./js/countdown/service')
const WordsGameService = require('./js/words-game/service');
const ScreenAlertService = require('./js/screen-alerts/service');
const { fstat } = require('fs');

// Set the view engine to Pug
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'pug'));

// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to serve static JS files from src/js
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/lib', express.static(path.resolve(__dirname, '../node_modules')));


// SASS middleware
app.use((req, res, next) => {
    if (req.url.endsWith('.css')) {
        let sassFilePath = path.resolve(path.join(__dirname, 'sass', req.url.replace('.css', '.sass')));
        let compiledSass = sass.compile(sassFilePath)
        res.setHeader('Content-Type', 'text/css');
        res.send(compiledSass.css);
    } else {
        next();
    }
});

// Pug middleware
app.use((req, res, next) => {
    if (req.url.endsWith('.html')) {
        const pugFile = path.join(__dirname, 'pug', req.url.replace('.html', '.pug'));
        res.send(pug.renderFile(pugFile));
    } else {
        next();
    }
});

// Serve index.html
app.get('/', (req, res) => {
    res.render('index');
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('message', (msg) => {
        console.log('Message received: ' + msg);
        socket.emit('message', 'Server received: ' + msg);
    });
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });

    socket.on('player-rank', playerName => {
        console.log('Searching for player '+ playerName);
        findAndPrintPlayerRank(playerName);
    })
    
    WordsGameService.setupIO(socket, io);
    CountdownService.setupIO(socket, io);
    ScreenAlertService.setupIO(socket, io);
});

// trust that the socket gets connected because it doesn't give a connect event
WordsGameService.setupStreamerbotListeners(streamerBotSocket);
ScreenAlertService.setupStreamerbotListeners(streamerBotSocket);

const PORT = process.env.PORT || settings.httpPort;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});



async function findAndPrintPlayerRank(playername){
	RiskRankService.GetRiskRank(playername, settings.pageDepth).then(result => {
        let rankData = {
            rankName: "NA",
            skillPoints: "0",
            leaderboardPosition: "> 1000"
        }
		if (result) {
            rankData.rankName = RiskRankService.GetRankName(result[2]);
            rankData.skillPoints = result[2];
            rankData.leaderboardPosition = result[0];

            io.emit('player-rank', rankData);
			console.log('Player found:', result);
		} else {
            
            io.emit('player-rank', rankData);
			console.log('Player not found.');
		}
	}).catch(error => {
		console.error('Error:', error.message);
	});
}


