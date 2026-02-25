// POLYFILL CRYPTO untuk Heroku
if (!globalThis.crypto) {
    const crypto = require('crypto');
    globalThis.crypto = crypto;
}

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== KONFIGURASI ==========
const NOMOR_BOT = '6283133199990'; // 083133199990
const ADMIN_NOMOR = '6283133199991@s.whatsapp.net';
// =================================

// Daftar proxy publik (free proxy list - bisa diganti)
const PROXY_LIST = [
    // Format: protocol://host:port
    // Ini hanya contoh, cari proxy aktif di https://free-proxy-list.net/
    'http://51.158.68.133:8811',
    'http://51.158.123.35:9999',
    'http://51.158.172.165:8811'
];

// State untuk pairing
let pairingCode = null;
let isConnected = false;
let botSocket = null;
let groupsDetected = [];
let currentProxyIndex = 0;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Buat folder auth jika belum ada
if (!fs.existsSync('./auth')) {
    fs.mkdirSync('./auth');
}

// Fungsi untuk mendapatkan agent proxy
function getProxyAgent() {
    if (process.env.USE_PROXY === 'false') return undefined;
    
    // Coba proxy dari environment variable dulu
    if (process.env.PROXY_URL) {
        try {
            if (process.env.PROXY_URL.startsWith('socks')) {
                return new SocksProxyAgent(process.env.PROXY_URL);
            } else {
                return new HttpsProxyAgent(process.env.PROXY_URL);
            }
        } catch (e) {
            console.log('Proxy env error:', e.message);
        }
    }
    
    // Fallback ke random proxy dari list
    try {
        const proxyUrl = PROXY_LIST[currentProxyIndex % PROXY_LIST.length];
        currentProxyIndex++;
        
        if (proxyUrl.startsWith('socks')) {
            return new SocksProxyAgent(proxyUrl);
        } else {
            return new HttpsProxyAgent(proxyUrl);
        }
    } catch (e) {
        return undefined;
    }
}

// Route utama
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
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
            }
            .info-card {
                background: #f8f9fa;
                border-radius: 15px;
                padding: 20px;
                margin: 20px 0;
            }
            .status-badge {
                padding: 5px 15px;
                border-radius: 50px;
                font-size: 14px;
                font-weight: 600;
            }
            .status-connected { background: #d4edda; color: #155724; }
            .status-disconnected { background: #f8d7da; color: #721c24; }
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
                margin: 10px 0;
            }
            .btn:hover { background: #075e54; }
            .code-box {
                background: #f0f0f0;
                padding: 20px;
                border-radius: 10px;
                text-align: center;
                font-family: monospace;
                font-size: 32px;
                letter-spacing: 8px;
                margin: 20px 0;
            }
            .group-item {
                background: #f8f9fa;
                border-left: 4px solid #128C7E;
                padding: 15px;
                margin: 10px 0;
                border-radius: 5px;
                word-break: break-all;
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
            .proxy-info {
                font-size: 12px;
                color: #666;
                margin-top: 10px;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 WA Bot Get Group ID</h1>
            
            <div class="info-card">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span>Nomor Bot:</span>
                    <strong>${NOMOR_BOT}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Status:</span>
                    <span id="statusBadge" class="status-badge status-disconnected">❌ Terputus</span>
                </div>
            </div>

            <div id="pairingSection">
                <button class="btn" onclick="getPairingCode()" id="pairingBtn">
                    🔐 Dapatkan Kode Pairing
                </button>
                <div id="loading" style="display:none; text-align:center;">
                    <div class="loading"></div> Memproses...
                </div>
                <div id="codeDisplay" style="display:none;">
                    <div class="code-box" id="pairingCode"></div>
                    <p style="text-align:center;">
                        1. Buka WhatsApp di HP<br>
                        2. Tap 3 titik > Perangkat tertaut<br>
                        3. Gabung menggunakan nomor telepon<br>
                        4. Masukkan kode di atas
                    </p>
                </div>
                <div class="proxy-info" id="proxyInfo"></div>
            </div>

            <div id="groupSection" style="display:none;">
                <h3>📱 Grup Terdeteksi</h3>
                <div id="groupList"></div>
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
                    
                    if (data.proxy) {
                        document.getElementById('proxyInfo').innerText = '🔄 Proxy: ' + data.proxy;
                    }
                } catch (err) {
                    alert('Error: ' + err.message);
                } finally {
                    document.getElementById('pairingBtn').disabled = false;
                    document.getElementById('loading').style.display = 'none';
                }
            }

            async function checkStatus() {
                try {
                    const res = await fetch('/api/status');
                    const data = await res.json();
                    
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
                    
                    if (data.groups && data.groups.length > 0) {
                        let html = '';
                        data.groups.forEach(g => {
                            html += \`
                                <div class="group-item">
                                    \${g}
                                    <button class="copy-btn" onclick="copyToClipboard('\${g}')">📋 Copy</button>
                                </div>
                            \`;
                        });
                        document.getElementById('groupList').innerHTML = html;
                    }
                    
                    if (data.proxy) {
                        document.getElementById('proxyInfo').innerText = '🔄 Proxy: ' + data.proxy;
                    }
                } catch (err) {}
            }

            function copyToClipboard(text) {
                navigator.clipboard.writeText(text);
                alert('ID grup disalin!');
            }

            setInterval(checkStatus, 3000);
            checkStatus();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// API endpoints
app.get('/api/pairing', async (req, res) => {
    if (pairingCode) {
        res.json({ 
            code: pairingCode,
            proxy: process.env.PROXY_URL || 'menggunakan proxy publik'
        });
    } else {
        res.json({ error: 'Kode belum siap', proxy: process.env.PROXY_URL });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        groups: groupsDetected,
        proxy: process.env.PROXY_URL || 'proxy publik'
    });
});

// Mulai server
app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`📱 Nomor bot: ${NOMOR_BOT}`);
    startBot();
});

// ================== BOT WHATSAPP DENGAN PROXY ==================
async function startBot() {
    console.log('🤖 Memulai bot WhatsApp...');
    
    try {
        pairingCode = null;
        
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        // Buat agent proxy
        const agent = getProxyAgent();
        if (agent) {
            console.log('🔌 Menggunakan proxy:', process.env.PROXY_URL || PROXY_LIST[currentProxyIndex-1]);
        } else {
            console.log('⚠️ Tidak menggunakan proxy (koneksi langsung)');
        }
        
        // Opsi koneksi
        const socketConfig = {
            auth: state,
            browser: ['Get Group ID', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            printQRInTerminal: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            generateHighQualityLinkPreview: false,
            shouldIgnoreJid: () => false
        };
        
        // Tambah proxy jika ada
        if (agent) {
            socketConfig.agent = agent;
        }
        
        const sock = makeWASocket(socketConfig);
        botSocket = sock;

        sock.ev.on('creds.update', saveCreds);

        // Minta kode pairing
        if (!state.creds?.registered) {
            console.log('📱 Meminta kode pairing...');
            
            // Coba beberapa kali dengan proxy berbeda
            for (let i = 0; i < 3; i++) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const code = await sock.requestPairingCode(NOMOR_BOT);
                    pairingCode = code;
                    console.log('✅ Kode pairing:', code);
                    break;
                } catch (err) {
                    console.log(`❌ Percobaan ${i+1} gagal:`, err.message);
                    if (i < 2) {
                        console.log('🔄 Ganti proxy...');
                        // Ganti proxy untuk percobaan berikutnya
                        const newAgent = getProxyAgent();
                        if (newAgent) {
                            sock.agent = newAgent;
                        }
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                isConnected = true;
                pairingCode = null;
                console.log('✅✅ BOT TERHUBUNG! ✅✅');
            }
            
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log('🔄 Reconnect dalam 5 detik...');
                    setTimeout(startBot, 5000);
                } else {
                    console.log('🚪 Logout. Hapus session...');
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
                
                if (!groupsDetected.includes(remoteJid)) {
                    groupsDetected.unshift(remoteJid);
                }
                
                fs.appendFileSync('./groups.txt', remoteJid + '\n');
                
                try {
                    await sock.sendMessage(ADMIN_NOMOR, {
                        text: `🔹 *ID GRUP DITEMUKAN*\n\n${remoteJid}`
                    });
                } catch (e) {}
            }
        });

    } catch (err) {
        console.log('❌ Fatal error:', err.message);
        setTimeout(startBot, 10000);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
