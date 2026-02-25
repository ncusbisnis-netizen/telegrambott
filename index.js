// POLYFILL CRYPTO untuk Heroku
if (!globalThis.crypto) {
    const crypto = require('crypto');
    globalThis.crypto = crypto;
}

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== KONFIGURASI ==========
const NOMOR_BOT = '6283133199990'; // 083133199990 dalam format internasional
const ADMIN_NOMOR = '6283133199991@s.whatsapp.net'; // nomor admin untuk kirim ID grup
// =================================

// State untuk pairing
let pairingCode = null;
let isConnected = false;
let botSocket = null;
let groupsDetected = [];

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Buat folder auth jika belum ada
if (!fs.existsSync('./auth')) {
    fs.mkdirSync('./auth');
}

// Route utama - Halaman Web
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WA Bot Get Group ID</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 20px;
                padding: 30px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            h1 {
                color: #128C7E;
                font-size: 28px;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            h1 span { font-size: 32px; }
            .subtitle {
                color: #666;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #f0f0f0;
            }
            .info-card {
                background: #f8f9fa;
                border-radius: 15px;
                padding: 20px;
                margin-bottom: 25px;
            }
            .info-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #e0e0e0;
            }
            .info-row:last-child { border-bottom: none; }
            .label { color: #666; font-weight: 500; }
            .value { font-weight: 600; color: #333; }
            .status-badge {
                padding: 5px 15px;
                border-radius: 50px;
                font-size: 14px;
                font-weight: 600;
            }
            .status-connected {
                background: #d4edda;
                color: #155724;
            }
            .status-disconnected {
                background: #f8d7da;
                color: #721c24;
            }
            .btn {
                background: #128C7E;
                color: white;
                border: none;
                padding: 15px 30px;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                width: 100%;
                transition: all 0.3s;
                margin: 10px 0;
            }
            .btn:hover {
                background: #075e54;
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(18,140,126,0.3);
            }
            .btn:disabled {
                background: #ccc;
                cursor: not-allowed;
                transform: none;
            }
            .code-box {
                background: #f0f0f0;
                padding: 20px;
                border-radius: 10px;
                text-align: center;
                font-family: monospace;
                font-size: 32px;
                letter-spacing: 8px;
                margin: 20px 0;
                border: 2px dashed #128C7E;
            }
            .group-item {
                background: #f8f9fa;
                border-left: 4px solid #128C7E;
                padding: 15px;
                margin: 10px 0;
                border-radius: 5px;
                font-family: monospace;
                word-break: break-all;
            }
            .group-item small {
                display: block;
                color: #666;
                font-size: 12px;
                margin-top: 5px;
            }
            .copy-btn {
                background: #128C7E;
                color: white;
                border: none;
                padding: 5px 15px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 5px;
                font-size: 12px;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                color: #999;
                font-size: 12px;
            }
            .loading {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #128C7E;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>
                <span>🤖</span> 
                WA Bot Get Group ID
            </h1>
            <div class="subtitle">Ambil ID grup WhatsApp dengan mudah</div>
            
            <div class="info-card">
                <div class="info-row">
                    <span class="label">Nomor Bot</span>
                    <span class="value">${NOMOR_BOT}</span>
                </div>
                <div class="info-row">
                    <span class="label">Status</span>
                    <span class="value">
                        <span id="statusBadge" class="status-badge ${isConnected ? 'status-connected' : 'status-disconnected'}">
                            ${isConnected ? '✅ Terhubung' : '❌ Terputus'}
                        </span>
                    </span>
                </div>
            </div>

            <div id="pairingSection" style="${isConnected ? 'display:none' : 'display:block'}">
                <button class="btn" onclick="getPairingCode()" id="pairingBtn">
                    🔐 Dapatkan Kode Pairing
                </button>
                <div id="loading" style="display:none; text-align:center; margin:10px 0;">
                    <div class="loading"></div> Memproses...
                </div>
                <div id="codeDisplay" style="display:none;">
                    <div class="code-box" id="pairingCode"></div>
                    <p style="color: #666; font-size: 14px; text-align:center;">
                        📱 Buka WhatsApp > 3 titik > Perangkat tertaut ><br>
                        Gabung menggunakan nomor telepon<br>
                        Masukkan kode di atas
                    </p>
                </div>
            </div>

            <div id="groupSection" style="${isConnected ? 'display:block' : 'display:none'}">
                <h3 style="margin-bottom:15px;">📱 Grup Terdeteksi</h3>
                <div id="groupList"></div>
                <p style="color: #666; font-size: 14px; margin-top:15px;">
                    ✨ Kirim pesan di grup target, ID akan muncul otomatis
                </p>
            </div>

            <div class="footer">
                <p>© 2026 WA Bot Get Group ID</p>
            </div>
        </div>

        <script>
            async function getPairingCode() {
                document.getElementById('pairingBtn').disabled = true;
                document.getElementById('loading').style.display = 'block';
                
                try {
                    const res = await fetch('/api/pairing');
                    const data = await res.json();
                    
                    if (data.code) {
                        document.getElementById('pairingCode').innerText = data.code;
                        document.getElementById('codeDisplay').style.display = 'block';
                    } else if (data.error) {
                        alert('Error: ' + data.error);
                    }
                } catch (err) {
                    alert('Gagal mendapatkan kode: ' + err.message);
                } finally {
                    document.getElementById('pairingBtn').disabled = false;
                    document.getElementById('loading').style.display = 'none';
                }
            }

            async function checkStatus() {
                try {
                    const res = await fetch('/api/status');
                    const data = await res.json();
                    
                    // Update status badge
                    const badge = document.getElementById('statusBadge');
                    if (data.connected) {
                        badge.className = 'status-badge status-connected';
                        badge.innerText = '✅ Terhubung';
                        document.getElementById('pairingSection').style.display = 'none';
                        document.getElementById('groupSection').style.display = 'block';
                    } else {
                        badge.className = 'status-badge status-disconnected';
                        badge.innerText = '❌ Terputus';
                        document.getElementById('pairingSection').style.display = 'block';
                        document.getElementById('groupSection').style.display = 'none';
                    }
                    
                    // Update group list
                    if (data.groups && data.groups.length > 0) {
                        let html = '';
                        data.groups.forEach(g => {
                            html += \`
                                <div class="group-item">
                                    \${g}
                                    <small>Ditemukan: \${new Date().toLocaleString()}</small>
                                    <button class="copy-btn" onclick="copyToClipboard('\${g}')">📋 Copy</button>
                                </div>
                            \`;
                        });
                        document.getElementById('groupList').innerHTML = html;
                    } else {
                        document.getElementById('groupList').innerHTML = '<p style="color:#999; text-align:center;">Belum ada grup terdeteksi</p>';
                    }
                } catch (err) {
                    console.error('Status check failed:', err);
                }
            }

            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    alert('ID grup disalin!');
                });
            }

            // Auto refresh status setiap 3 detik
            setInterval(checkStatus, 3000);
            checkStatus(); // Panggil pertama kali
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// API untuk mendapatkan pairing code
app.get('/api/pairing', async (req, res) => {
    if (pairingCode) {
        res.json({ code: pairingCode });
    } else {
        res.json({ error: 'Kode belum tersedia, coba lagi dalam beberapa detik' });
    }
});

// API untuk cek status
app.get('/api/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        groups: groupsDetected 
    });
});

// API untuk restart bot
app.post('/api/restart', (req, res) => {
    res.json({ message: 'Restarting bot...' });
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

// Mulai server
app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`📱 Nomor bot: ${NOMOR_BOT}`);
    startBot();
});

// ================== BOT WHATSAPP ==================
async function startBot() {
    console.log('🤖 Memulai bot WhatsApp...');
    
    try {
        // Reset state
        pairingCode = null;
        
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        const sock = makeWASocket({
            auth: state,
            browser: ['Get Group ID', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            printQRInTerminal: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            generateHighQualityLinkPreview: false,
            shouldIgnoreJid: () => false
        });

        // Simpan socket untuk digunakan nanti
        botSocket = sock;

        sock.ev.on('creds.update', saveCreds);

        // Proses pairing jika belum login
        if (!state.creds?.registered) {
            console.log('📱 Meminta kode pairing...');
            
            try {
                // Tunggu sebentar sebelum minta kode
                await new Promise(resolve => setTimeout(resolve, 2000));
                
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
                pairingCode = null; // Hapus kode pairing setelah berhasil
                console.log('✅✅ BOT TERHUBUNG! ✅✅');
                console.log('📱 Nomor bot:', NOMOR_BOT);
            }
            
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log('🔄 Reconnect dalam 5 detik...');
                    setTimeout(startBot, 5000);
                } else {
                    console.log('🚪 Logout. Menghapus session...');
                    try {
                        fs.rmSync('./auth', { recursive: true, force: true });
                        fs.mkdirSync('./auth');
                    } catch (e) {}
                    setTimeout(startBot, 5000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;
            
            const remoteJid = m.key.remoteJid;
            
            if (remoteJid && remoteJid.endsWith('@g.us')) {
                console.log('🎯 ID GRUP:', remoteJid);
                
                // Simpan ke memory
                if (!groupsDetected.includes(remoteJid)) {
                    groupsDetected.unshift(remoteJid);
                    if (groupsDetected.length > 10) groupsDetected.pop(); // max 10
                }
                
                // Simpan ke file
                try {
                    fs.appendFileSync('./groups.txt', remoteJid + '\n');
                } catch (e) {}
                
                // Kirim ke admin
                try {
                    await sock.sendMessage(ADMIN_NOMOR, {
                        text: `🔹 *ID GRUP DITEMUKAN*\n\n${remoteJid}\n\nWaktu: ${new Date().toLocaleString('id-ID')}`
                    });
                    console.log('✅ ID grup dikirim ke admin');
                } catch (e) {
                    console.log('❌ Gagal kirim ke admin:', e.message);
                }
            }
        });

        // Handle error
        sock.ev.on('error', (err) => {
            console.log('❌ Socket error:', err.message);
        });

    } catch (err) {
        console.log('❌ Fatal error:', err.message);
        console.log('🔄 Restart dalam 10 detik...');
        setTimeout(startBot, 10000);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    process.exit(0);
});
