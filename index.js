const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// ================== CONFIG ==================
const BOT_TOKEN = process.env.BOT_TOKEN; // Ambil dari environment variable Heroku
const GABUNG_URL = process.env.GABUNG_URL || "https://cancelmlbb.online/tes.php";
const CHANNEL = process.env.CHANNEL || "@allgamencus";
const GROUP = process.env.GROUP || "@mahsuselitz";
const STOK_ADMIN = process.env.STOK_ADMIN || "https://whatsapp.com/channel/0029VbA4PrD5fM5TMgECoE1E";
const COOLDOWN = parseInt(process.env.COOLDOWN) || 180; // 3 menit
const PORT = process.env.PORT || 3000;

// Admin IDs (dari environment variable, pisahkan dengan koma)
const ADMIN_IDS = (process.env.ADMIN_IDS || "7268861803,123456789").split(',').map(id => parseInt(id.trim()));

// ================== DATABASE ==================
const dbFile = path.join(__dirname, 'database.json');
let db = { users: {}, total_success: 0, feature: { info: true } };

// Inisialisasi database
async function initDB() {
    try {
        if (!await fs.pathExists(dbFile)) {
            await fs.writeJson(dbFile, db, { spaces: 2 });
        }
        db = await fs.readJson(dbFile);
    } catch (error) {
        console.error('Error init DB:', error);
    }
}

// ================== SETUP BOT ==================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

// Middleware untuk webhook (jika diperlukan)
app.use(express.json());

// Health check untuk Heroku
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

// Webhook endpoint (opsional, bisa pakai polling saja)
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ================== UTILITY FUNCTIONS ==================
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

async function sendMessage(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (error) {
        console.error('Error sendMessage:', error);
        return null;
    }
}

async function sendMessageWithButton(chatId, text, buttons) {
    try {
        return await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });
    } catch (error) {
        console.error('Error sendMessageWithButton:', error);
    }
}

async function deleteMessage(chatId, messageId) {
    try {
        if (messageId) {
            await bot.deleteMessage(chatId, messageId);
        }
    } catch (error) {
        console.error('Error deleteMessage:', error);
    }
}

async function isJoined(userId, chat) {
    try {
        const chatMember = await bot.getChatMember(chat, userId);
        const status = chatMember.status;
        return ['member', 'administrator', 'creator'].includes(status);
    } catch (error) {
        console.error('Error checking join status:', error);
        return false;
    }
}

async function fetchUrl(url) {
    try {
        const response = await axios.get(url, { timeout: 30000 });
        return response.data;
    } catch (error) {
        console.error('Error fetchUrl:', error);
        return '';
    }
}

// Cooldown management
const cooldownFile = path.join(__dirname, 'cooldown.json');
let cooldownData = {};

async function initCooldown() {
    try {
        if (await fs.pathExists(cooldownFile)) {
            cooldownData = await fs.readJson(cooldownFile);
        } else {
            cooldownData = {};
            await fs.writeJson(cooldownFile, cooldownData);
        }
    } catch (error) {
        console.error('Error init cooldown:', error);
    }
}

async function checkCooldown(userId) {
    const last = cooldownData[userId] || 0;
    const now = Math.floor(Date.now() / 1000);
    
    if (now - last < COOLDOWN) {
        return COOLDOWN - (now - last);
    }
    
    cooldownData[userId] = now;
    await fs.writeJson(cooldownFile, cooldownData);
    return 0;
}

// ================== BOT COMMANDS ==================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (isAdmin(userId)) {
        const adminMsg = `👑 ADMIN MODE\n\nPerintah:\n/info USER SERVER\n/offinfo\n/oninfo\n/ranking`;
        await sendMessage(chatId, adminMsg);
    } else {
        await sendMessage(chatId, 
            "👋 Welcome!\nGunakan:\n/info USER_ID SERVER_ID\n\nContoh:\n/info 643461181 8554"
        );
    }
});

// Admin commands
bot.onText(/\/offinfo/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) return;
    
    db.feature.info = false;
    await fs.writeJson(dbFile, db, { spaces: 2 });
    await sendMessage(chatId, "🚫 Fitur /info dinonaktifkan.");
});

bot.onText(/\/oninfo/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) return;
    
    db.feature.info = true;
    await fs.writeJson(dbFile, db, { spaces: 2 });
    await sendMessage(chatId, "✅ Fitur /info diaktifkan.");
});

bot.onText(/\/ranking/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) return;
    
    const users = db.users || {};
    const sortedUsers = Object.values(users)
        .filter(u => u.username)
        .sort((a, b) => (b.success || 0) - (a.success || 0));
    
    let rankingMsg = "🏆 RANKING OUTPUT SUCCESS\n\n";
    if (sortedUsers.length === 0) {
        rankingMsg += "Belum ada data.";
    } else {
        sortedUsers.forEach((user, index) => {
            rankingMsg += `${index + 1}. @${user.username} - ${user.success}x\n`;
        });
    }
    
    await sendMessage(chatId, rankingMsg);
});

// Main info command
bot.onText(/\/info (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || "";
    const args = match[1].split(' ');
    
    if (args.length < 2) {
        await sendMessage(chatId, "❌ Format salah.\nContoh: /info 643461181 8554");
        return;
    }

    // Cek join untuk non-admin
    if (!isAdmin(userId)) {
        // Cek username
        if (!username) {
            const tutorial = "⚠️ Kamu wajib punya username Telegram untuk menggunakan /info.\n\n" +
                "📌 Cara membuat username Telegram:\n" +
                "1️⃣ Buka Telegram di Android / iOS\n" +
                "2️⃣ Masuk ke Settings / Pengaturan\n" +
                "3️⃣ Pilih Username → Buat username baru\n" +
                "4️⃣ Username minimal 5 karakter, hanya huruf, angka, dan _\n" +
                "5️⃣ Simpan, lalu coba lagi /info\n\n" +
                "Contoh: @ncus999";
            
            await sendMessage(chatId, tutorial);
            return;
        }

        // Cek join channel & group
        const joinMissing = [];
        if (!await isJoined(userId, CHANNEL)) joinMissing.push(CHANNEL);
        if (!await isJoined(userId, GROUP)) joinMissing.push(GROUP);

        if (joinMissing.length > 0) {
            const buttons = joinMissing.map(c => [{
                text: `📢 Join ${c.replace('@', '')}`,
                url: `https://t.me/${c.replace('@', '')}`
            }]);
            await sendMessageWithButton(chatId, "🚫 Akses ditolak.\nSilakan join terlebih dahulu:", buttons);
            return;
        }

        // Cek cooldown
        const cooldownRemaining = await checkCooldown(userId);
        if (cooldownRemaining > 0) {
            await sendMessage(chatId, `⏳ Cooldown ${cooldownRemaining} second.`);
            return;
        }
    }

    // Cek fitur info aktif
    if (!db.feature.info && !isAdmin(userId)) {
        await sendMessageWithButton(chatId,
            "🚫 Fitur /info sedang dinonaktifkan oleh admin.",
            [[{ text: "Stok Admin Disini", url: STOK_ADMIN }]]
        );
        return;
    }

    const targetUserId = args[0];
    const serverId = args[1];

    // Kirim loading message
    const loadingMsg = await sendMessage(chatId, "Gathering your information…");

    try {
        // Fetch data
        const url = `${GABUNG_URL}?userId=${targetUserId}&serverId=${serverId}&role_id=${targetUserId}&zone_id=${serverId}`;
        const data = await fetchUrl(url);
        const decodedData = data; // Sudah string

        // Parse data dengan regex
        const uidMatch = decodedData.match(/\[userId\] => (.*?)\s/);
        const sidMatch = decodedData.match(/\[serverId\] => (.*?)\s/);
        const unameMatch = decodedData.match(/\[username\] => (.*?)\s/);
        const regionMatch = decodedData.match(/\[region\] => (.*?)\s/);
        const deviceMatch = decodedData.match(/Android:\s*(\d+)\s*\|\s*iOS:\s*(\d+)/);
        const ttlMatch = decodedData.match(/<td>\d+<\/td>\s*<td>\d+<\/td>\s*<td>.*?<\/td>\s*<td>(.*?)<\/td>/s);

        // Parse binds
        const binds = {};
        const bindMatches = decodedData.matchAll(/<li>(.*?) : (.*?)\.?<\/li>/g);
        for (const match of bindMatches) {
            const service = match[1].trim();
            const value = match[2].trim();
            binds[service] = (value && value.toLowerCase() !== 'empty') ? value : 'empty.';
        }

        const nickname = unameMatch ? unameMatch[1].replace(/\+/g, ' ') : '-';

        // Format output
        let output = `✧ ID: ${uidMatch ? uidMatch[1] : '-'}\n`;
        output += `✧ Server: ${sidMatch ? sidMatch[1] : '-'}\n`;
        output += `✧ Nickname: ${nickname}\n`;
        output += `✧ Creation Date: ${ttlMatch ? ttlMatch[1] : '-'}\n`;
        output += `✧ REGION : ${regionMatch ? regionMatch[1] : '-'}\n\n`;

        output += "BIND ACCOUNT INFO:\n";
        for (const [service, val] of Object.entries(binds)) {
            output += `✧ ${service} : ${val}\n`;
        }

        output += `\nDevice Login Android: ${deviceMatch ? deviceMatch[1] : '0'} | iOS: ${deviceMatch ? deviceMatch[2] : '0'}`;

        // Hapus loading message
        await deleteMessage(chatId, loadingMsg.message_id);

        // Kirim hasil
        await sendMessageWithButton(chatId, output, [[{ text: "Stok Admin Disini", url: STOK_ADMIN }]]);

        // Update database success count
        if (!db.users[userId]) {
            db.users[userId] = { username, success: 0 };
        }
        db.users[userId].username = username;
        db.users[userId].success += 1;
        db.total_success += 1;
        await fs.writeJson(dbFile, db, { spaces: 2 });

    } catch (error) {
        console.error('Error processing info:', error);
        await deleteMessage(chatId, loadingMsg.message_id);
        await sendMessage(chatId, "❌ Terjadi kesalahan saat mengambil data.");
    }
});

// Unknown command handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Skip jika command sudah ditangani
    if (text && (text.startsWith('/info') || text.startsWith('/start') || 
        text.startsWith('/offinfo') || text.startsWith('/oninfo') || 
        text.startsWith('/ranking'))) {
        return;
    }
    
    await sendMessage(chatId, "❌ Perintah tidak dikenali.");
});

// ================== INITIALIZATION ==================
async function start() {
    await initDB();
    await initCooldown();
    
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('Bot is starting...');
    });
}

start().catch(console.error);
