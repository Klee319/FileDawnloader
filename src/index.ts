// Main entry point - starts both server and Discord bot
console.log('FileDawnloader starting...');

// Start HTTP server
import './server/index';

// Start Discord bot
import './bot/index';

console.log('FileDawnloader initialized (Server + Bot)');
