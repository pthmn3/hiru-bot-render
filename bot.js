const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const axios = require('axios');

// 🔴 CONFIGURATION
const API_URL = 'https://hiru-news2.vercel.app/api'; 
const PORT = process.env.PORT || 3000;

// 1. Setup Web Server (To show QR Code and keep Render alive)
const app = express();
let qrCodeUrl = null;
let isConnected = false;

app.get('/', (req, res) => {
    if (isConnected) return res.send('<h1>✅ Bot is connected and active!</h1>');
    if (qrCodeUrl) return res.send(`<h1>Scan this QR Code:</h1><img src="${qrCodeUrl}">`);
    res.send('<h1>⏳ Generating QR Code... Please refresh in 10 seconds.</h1>');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// 2. Setup WhatsApp Bot
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    console.log('QR Received');
    // Convert text QR to Image URL for the browser
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeUrl = url;
    });
});

client.on('ready', () => {
    console.log('✅ Client is ready!');
    isConnected = true;
});

client.on('message', async msg => {
    const command = msg.body.toLowerCase();

    // COMMAND: !breaking
    if (command === '!breaking') {
        try {
            const response = await axios.get(`${API_URL}/breaking-news?limit=5`);
            const news = response.data.data;
            let reply = '*🚨 Breaking News 🚨*\n\n';
            news.forEach(item => {
                reply += `📌 *${item.headline}*\n🔗 ${item.url}\n\n`;
            });
            msg.reply(reply);
        } catch (error) {
            msg.reply('❌ Error fetching breaking news.');
        }
    }

    // COMMAND: !latest
    else if (command === '!latest') {
        try {
            const response = await axios.get(`${API_URL}/latest-news?limit=5`);
            const news = response.data.data;
            let reply = '*📰 Latest News*\n\n';
            news.forEach(item => {
                reply += `Title: *${item.headline}*\n\n`;
            });
            msg.reply(reply);
        } catch (error) {
            msg.reply('❌ Error fetching news.');
        }
    }
});

client.initialize();