const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// NOMOR BOT (ganti dengan nomor Anda)
const NOMOR_BOT = '6283133199990'; // 083133199990 dalam format internasional
const ADMIN_NOMOR = '6283133199991@s.whatsapp.net'; // nomor admin untuk kirim ID

// State untuk pairing
let pairingCode = null;
let isConnected = false;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Route utama
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>WA Bot Get Group ID</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial; padding: 20px; background: #f0f2f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #128C7E; }
                .info { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 10px 0; }
                .code { background: #f5f5f5; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 24px; text-align: center; letter-spacing: 5px; }
                .status { padding: 10px; border-radius: 5px; }
                .connected { background: #d4edda; color: #155724; }
                .disconnected { background: #f8d7da; color: #721c24; }
                button { background: #128C7E; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; }
                button:hover { background: #075e54; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 WA Bot Get Group ID</h1>
                <p>Bot untuk mengambil ID grup WhatsApp</p>
                
                <div class="info">
                    <strong>Nomor Bot:</strong> ${NOMOR_BOT}<br>
                    <strong>Status:</strong> <span id="status">${isConnected ? '✅ Terhubung' : '❌ Terputus'}</span>
                </div>
                
                <div id="pairingSection" style="${isConnected ? 'display:none' : 'display:block'}">
                    <h3>🔐 Proses Pairing</h3>
                    <p>Jika bot belum terhubung, klik tombol di bawah untuk mendapatkan kode pairing:</p>
                    <button onclick="getPairingCode()">Dapatkan Kode Pairing</button>
                    
                    <div id="codeDisplay" style="margin-top: 20px; display:none;">
                        <p>Masukkan kode ini di WhatsApp:</p>
                        <div class="code" id="pairingCode"></div>
                        <p style="font-size: 14px; color: #666;">Buka WhatsApp > 3 titik > Perangkat tertaut > Gabung menggunakan nomor telepon</p>
                    </div>
                </div>
                
                <div id="groupSection" style="${isConnected ? 'display:block' : 'display:none'}">
                    <h3>📱 Grup Terdeteksi</h3>
                    <div id="groupList"></div>
                </div>
            </div>
            
            <script>
                async function getPairingCode() {
                    const res = await fetch('/pairing');
                    const data = await res.json();
                    if (data.code) {
                        document.getElementById('pairingCode').innerText = data.code;
                        document.getElementById('codeDisplay').style.display = 'block';
                    }
                }
                
                async function checkStatus() {
                    const res = await fetch('/status');
                    const data = await res.json();
                    document.getElementById('status').innerText = data.connected ? '✅ Terhubung' : '❌ Terputus';
                    
                    if (data.groups && data.groups.length > 0) {
                        let html = '';
                        data.groups.forEach(g => {
                            html += \`<div style="background: #f0f2f5; padding: 10px; margin: 5px 0; border-radius: 5px;">\${g}</div>\`;
                        });
                        document.getElementById('groupList').innerHTML = html;
                    }
                }
                
                setInterval(checkStatus, 5000);
            </script>
        </body>
        </html>
    `);
});

// API untuk mendapatkan pairing code
app.get('/pairing', async (req, res) => {
    if (pairingCode) {
        res.json({ code: pairingCode });
    } else {
        res.json({ error: 'Belum ada kode, coba lagi nanti' });
    }
});

// API untuk cek status
app.get('/status', (req, res) => {
    const groups = [];
    if (fs.existsSync('./groups.txt')) {
        const data = fs.readFileSync('./groups.txt', 'utf8');
        groups.push(...data.split('\n').filter(Boolean));
    }
    res.json({ connected: isConnected, groups });
});

// Mulai server
app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    startBot();
});

// ================== BOT WHATSAPP ==================
async function startBot() {
    console.log('🤖 Memulai bot WhatsApp...');
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        const sock = makeWASocket({
            auth: state,
            browser: ['Get Group ID', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            printQRInTerminal: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000
        });

        sock.ev.on('creds.update', saveCreds);

        // Proses pairing jika belum login
        if (!state.creds?.registered) {
            console.log('📱 Meminta kode pairing...');
            
            try {
                const code = await sock.requestPairingCode(NOMOR_BOT);
                pairingCode = code;
                console.log('✅ Kode pairing:', code);
            } catch (err) {
                console.log('❌ Gagal minta kode:', err.message);
            }
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                isConnected = true;
                console.log('✅✅ BOT TERHUBUNG! ✅✅');
                console.log('Nomor bot:', NOMOR_BOT);
            }
            
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log('🔄 Reconnect dalam 5 detik...');
                    setTimeout(startBot, 5000);
                } else {
                    console.log('🚪 Logout. Hapus folder auth dan restart.');
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;
            
            const remoteJid = m.key.remoteJid;
            
            if (remoteJid.endsWith('@g.us')) {
                console.log('🎯 ID GRUP:', remoteJid);
                
                // Simpan ke file
                fs.appendFileSync('./groups.txt', remoteJid + '\n');
                
                // Kirim ke admin
                try {
                    await sock.sendMessage(ADMIN_NOMOR, {
                        text: `🔹 *ID GRUP DITEMUKAN*\n\n${remoteJid}`
                    });
                } catch (e) {}
            }
        });

    } catch (err) {
        console.log('❌ Error:', err);
        setTimeout(startBot, 10000);
    }
}
