const runYtdlp = require('./ytdlp');

// Example: search for a song and get best audio
const command = `"https://www.youtube.com/watch?v=6h6AQbdTkaE"`;

// Start the streaming command
runYtdlp(command, { timeout: 20 }); // auto-close after 15s
