const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const axios = require('axios');

// 🔴 CONFIGURATION
const API_URL = 'https://hiru-news2.vercel.app/api'; // 👈 PASTE YOUR API URL HERE
const PORT = process.env.PORT || 3000;
const CHECK_INTERVAL_MINUTES = 10; // Check for news every 10 minutes

const app = express();
let qrCodeUrl = null;
let isConnected = false;
let subscribedChats = new Set(); // Stores chats that want auto-updates
let lastProcessedArticleId = null; // Keeps track of the last news we sent

// 1. WEB SERVER (For Railway/Render/Replit)
app.get('/', (req, res) => {
    if (isConnected) return res.send('<h1>✅ Bot is connected!</h1>');
    if (qrCodeUrl) return res.send(`
        <h1>Scan this QR Code:</h1>
        <img src="${qrCodeUrl}" style="width: 300px; height: 300px;">
    `);
    res.send('<h1>⏳ Generating QR Code... Refresh in 5 seconds.</h1>');
});
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// 2. WHATSAPP BOT SETUP
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('QR Received');
    qrcode.toDataURL(qr, (err, url) => { qrCodeUrl = url; });
});

client.on('ready', async () => {
    console.log('✅ Client is ready!');
    isConnected = true;
    
    // Initialize the auto-news checker
    console.log('🔄 Starting News Poller...');
    await initializeNewsState();
    setInterval(checkAndSendNews, CHECK_INTERVAL_MINUTES * 60 * 1000);
});

// 3. AUTO-NEWS LOGIC
async function initializeNewsState() {
    try {
        // Fetch the latest news just to set the ID (don't send it yet)
        const response = await axios.get(`${API_URL}/latest-news?limit=1`);
        if (response.data.data.length > 0) {
            lastProcessedArticleId = response.data.data[0].id;
            console.log(`ℹ️ Initialized with latest article ID: ${lastProcessedArticleId}`);
        }
    } catch (error) {
        console.error('❌ Failed to initialize news state:', error.message);
    }
}

async function checkAndSendNews() {
    if (subscribedChats.size === 0) return; // Don't check if no one is listening

    try {
        // 1. Check for new articles
        const response = await axios.get(`${API_URL}/latest-news?limit=1`);
        const latestArticle = response.data.data[0];

        if (!latestArticle || latestArticle.id === lastProcessedArticleId) {
            return; // No new news
        }

        console.log(`🚨 New article detected: ${latestArticle.id}`);
        lastProcessedArticleId = latestArticle.id;

        // 2. Fetch FULL details for this new article.js]
        const fullArticleResponse = await axios.get(`${API_URL}/article/${latestArticle.id}`);
        const fullArticle = fullArticleResponse.data.data;

        // 3. Prepare Media (Image)
        let media = null;
        if (fullArticle.thumbnail) {
            try {
                media = await MessageMedia.fromUrl(fullArticle.thumbnail);
            } catch (e) { console.error('Error fetching image'); }
        }

        // 4. Prepare Text
        const messageText = `*🔔 NEW NOTIFICATION*\n\n` +
            `*${fullArticle.headline}*\n\n` +
            `_${fullArticle.publishedDate || 'Just Now'}_\n` +
            `-----------------------------\n` +
            `${fullArticle.fullText}\n\n` +
            `🔗 ${fullArticle.url}`;

        // 5. Broadcast to all subscribed chats
        for (const chatId of subscribedChats) {
            if (media) {
                await client.sendMessage(chatId, media, { caption: messageText });
            } else {
                await client.sendMessage(chatId, messageText);
            }
        }

    } catch (error) {
        console.error('❌ Error in auto-news poller:', error.message);
    }
}

// 4. COMMAND HANDLING
client.on('message', async msg => {
    const command = msg.body.toLowerCase().trim();

    // --- NEW: SUBSCRIPTION COMMANDS ---
    if (command === '!notify' || command === '!start') {
        subscribedChats.add(msg.from);
        msg.reply('✅ *Notifications Enabled!* You will now receive news updates automatically.');
    }
    else if (command === '!stop') {
        subscribedChats.delete(msg.from);
        msg.reply('🔕 *Notifications Disabled.*');
    }

    // --- EXISTING COMMANDS ---
    else if (command === '!latest') {
        try {
            const response = await axios.get(`${API_URL}/latest-news?limit=5`);
            const news = response.data.data;
            let reply = '*📰 Latest Hiru News*\n\n';
            news.forEach(item => { reply += `📌 *${item.headline}*\n\n`; });
            msg.reply(reply);
        } catch (error) { msg.reply('❌ Error fetching news.'); }
    }
    
    else if (command.startsWith('!search ')) {
        const query = command.replace('!search ', '');
        try {
            const response = await axios.get(`${API_URL}/search?q=${query}`);
            const results = response.data.data;
            if (results.length === 0) msg.reply('No results.');
            else {
                let reply = `*🔍 Search: ${query}*\n\n`;
                results.slice(0, 3).forEach(item => reply += `📌 *${item.headline}*\n\n`);
                msg.reply(reply);
            }
        } catch (error) { msg.reply('Error searching.'); }
    }

    else if (command.startsWith('!read ')) {
        const id = command.replace('!read ', '').trim();
        try {
            const response = await axios.get(`${API_URL}/article/${id}`);
            const article = response.data.data;
            if (article) {
                let media = null;
                if (article.thumbnail) media = await MessageMedia.fromUrl(article.thumbnail);
                
                const text = `*${article.headline}*\n\n${article.fullText}\n\n🔗 ${article.url}`;
                
                if (media) client.sendMessage(msg.from, media, { caption: text });
                else msg.reply(text);
            }
        } catch (error) { msg.reply('❌ Invalid Article ID.'); }
    }

    else if (command === '!help') {
        msg.reply(
            `*🤖 HIRU BOT COMMANDS*\n\n` +
            `🔔 *!notify* - Subscribe to auto-updates\n` +
            `🔕 *!stop* - Stop auto-updates\n` +
            `📰 *!latest* - Get latest news list\n` +
            `🔍 *!search <text>* - Find news\n` +
            `📖 *!read <id>* - Read full article`
        );
    }
});

client.initialize();

// Prevent bot from crashing on "markedUnread" errors
process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
    // If it's the specific WhatsApp error, ignore it to keep bot alive
    if (err.message.includes('markedUnread')) {
        console.log('⚠️ Ignoring markedUnread error to keep bot online.');
        return;
    }
    // Optional: Restart client if needed
    // client.destroy().then(() => client.initialize());
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection:', reason);
});

