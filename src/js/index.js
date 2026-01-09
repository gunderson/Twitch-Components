// require jquery, socket.io

let socket;

document.addEventListener('DOMContentLoaded', () => {
	socket = io()
    const input = document.getElementById('messageInput');
    const button = document.getElementById('sendButton');
    const status = document.getElementById('status');

    button.addEventListener('click', () => {
        const message = input.value;
        socket.emit('message', message);
    });

    socket.on('message', (msg) => {
        status.innerHTML= msg;
    });
});