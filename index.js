// POLYFILL CRYPTO
if (!globalThis.crypto) {
    const crypto = require('crypto');
    globalThis.crypto = crypto;
}

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { HttpsProxyAgent } = require('https-proxy-agent');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== KONFIGURASI ==========
const NOMOR_BOT = '6283133199990';
const ADMIN_NOMOR = '6283133199991@s.whatsapp.net';
// =================================

// Daftar proxy publik (bisa diganti)
const PROXY_LIST = [
    'http://51.158.68.133:8811',
    'http://51.158.123.35:9999',
    'http://139.162.78.109:3128',
    'http://165.22.73.197:3128',
    'http://167.99.172.167:3128'
];

let pairingCode = null;
let isConnected = false;
let groupsDetected = [];
let currentProxyIndex = 0;
let botSocket = null;
let retryCount = 0;

app.use(express.json());

if (!fs.existsSync('./auth')) {
    fs.mkdirSync('./auth');
}

// Halaman utama dengan auto-refresh
app.get('/', (req, res) => {
    res.send(`
    <html>
    <head>
        <title>WA Bot Get Group ID</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="5">
        <style>
            body { font-family: Arial; padding: 20px; background: #f0f2f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 15px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #128C7E; }
            .info-card { background: #f8f9fa; padding: 15px; border-radius: 10px; margin: 20px 0; }
            .status-badge { padding: 5px 10px; border-radius: 5px; font-weight: bold; }
            .connected { background: #d4edda; color: #155724; }
            .disconnected { background: #f8d7da; color: #721c24; }
            .btn { background: #128C7E; color: white; border: none; padding: 15px; border-radius: 10px; width: 100%; font-size: 16px; cursor: pointer; margin: 5px 0; }
            .btn:hover { background: #075e54; }
            .code-box { background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 5px; margin: 20px 0; border-radius: 10px; border: 2px dashed #128C7E; }
            .group-item { background: #e8f5e9; padding: 15px; margin: 10px 0; border-radius: 5px; word-break: break-all; border-left: 4px solid #128C7E; }
            .info-text { font-size: 12px; color: #666; margin-top: 10px; }
            .loading { display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #128C7E; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .error { color: #dc3545; font-size: 14px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 WA Bot Get Group ID</h1>
            
            <div class="info-card">
                <p><strong>Nomor Bot:</strong> ${NOMOR_BOT}</p>
                <p><strong>Status:</strong> <span class="status-badge ${isConnected ? 'connected' : 'disconnected'}" id="status">${isConnected ? '✅ Terhubung' : '❌ Terputus'}</span></p>
                <p><strong>Proxy:</strong> <span id="proxyInfo">${PROXY_LIST[currentProxyIndex % PROXY_LIST.length]}</span></p>
                <p><strong>Percobaan:</strong> <span id="retryCount">${retryCount}</span></p>
            </div>
            
            <button class="btn" onclick="getPairing()" id="pairingBtn">
                🔐 Dapatkan Kode Pairing
            </button>
            
            <button class="btn" onclick="gantiProxy()" style="background: #6c757d;">
                🔄 Ganti Proxy
            </button>
            
            <div id="loading" style="display:none; text-align:center; margin:20px;">
                <div class="loading"></div>
                <p>Memproses...</p>
            </div>
            
            <div id="codeArea" style="display:none; margin-top:20px;">
                <h3>🔑 Kode Pairing:</h3>
                <div class="code-box" id="pairingCode"></div>
                <p class="info-text">
                    1. Buka WhatsApp di HP nomor bot (${NOMOR_BOT})<br>
                    2. Tap 3 titik > Perangkat tertaut<br>
                    3. Pilih "Gabung menggunakan nomor telepon"<br>
                    4. Masukkan kode di atas
                </p>
            </div>
            
            <div id="errorArea" style="display:none; margin-top:20px;">
                <div class="error" id="errorMessage"></div>
            </div>
            
            <div id="groupArea" style="display:none; margin-top:20px;">
                <h3>📱 Grup Terdeteksi</h3>
                <div id="groupList"></div>
                <p class="info-text">Kirim pesan di grup target, ID akan muncul otomatis</p>
            </div>
            
            <div class="info-text" style="margin-top:20px;">
                <p>⏱️ Halaman auto-refresh setiap 5 detik</p>
            </div>
        </div>
        
        <script>
            async function getPairing() {
                document.getElementById('pairingBtn').disabled = true;
                document.getElementById('loading').style.display = 'block';
                
                try {
                    const res = await fetch('/api/pairing');
                    const data = await res.json();
                    
                    if (data.code) {
                        document.getElementById('pairingCode').innerText = data.code;
                        document.getElementById('codeArea').style.display = 'block';
                        document.getElementById('errorArea').style.display = 'none';
                    } else if (data.error) {
                        document.getElementById('errorMessage').innerText = data.error;
                        document.getElementById('errorArea').style.display = 'block';
                    }
                } catch (err) {
                    document.getElementById('errorMessage').innerText = 'Error: ' + err.message;
                    document.getElementById('errorArea').style.display = 'block';
                } finally {
                    document.getElementById('pairingBtn').disabled = false;
                    document.getElementById('loading').style.display = 'none';
                }
            }
            
            async function gantiProxy() {
                document.getElementById('loading').style.display = 'block';
                try {
                    const res = await fetch('/api/ganti-proxy', { method: 'POST' });
                    const data = await res.json();
                    location.reload();
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            }
            
            async function checkStatus() {
                try {
                    const res = await fetch('/api/status');
                    const data = await res.json();
                    
                    const statusEl = document.getElementById('status');
                    if (data.connected) {
                        statusEl.className = 'status-badge connected';
                        statusEl.innerText = '✅ Terhubung';
                        document.getElementById('codeArea').style.display = 'none';
                        document.getElementById('groupArea').style.display = 'block';
                    } else {
                        statusEl.className = 'status-badge disconnected';
                        statusEl.innerText = '❌ Terputus';
                    }
                    
                    document.getElementById('proxyInfo').innerText = data.proxy;
                    document.getElementById('retryCount').innerText = data.retryCount;
                    
                    if (data.groups && data.groups.length > 0) {
                        let html = '';
                        data.groups.forEach(g => {
                            html += \`
                                <div class="group-item">
                                    <strong>ID Grup:</strong> \${g}<br>
                                    <button onclick="copyToClipboard('\${g}')" style="margin-top:5px; padding:5px; background:#128C7E; color:white; border:none; border-radius:3px;">📋 Copy</button>
                                </div>
                            \`;
                        });
                        document.getElementById('groupList').innerHTML = html;
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            
            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    alert('ID grup disalin!');
                });
            }
            
            setInterval(checkStatus, 3000);
            checkStatus();
        </script>
    </body>
    </html>
    `);
});

// API endpoints
app.get('/api/pairing', (req, res) => {
    if (pairingCode) {
        res.json({ code: pairingCode });
    } else {
        res.json({ error: 'Kode sedang diproses, coba lagi 10 detik lagi' });
    }
});

app.post('/api/ganti-proxy', (req, res) => {
    currentProxyIndex++;
    res.json({ message: 'Mengganti proxy...' });
    setTimeout(() => {
        process.exit(0); // Restart app
    }, 1000);
});

app.get('/api/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        groups: groupsDetected,
        proxy: PROXY_LIST[currentProxyIndex % PROXY_LIST.length],
        retryCount: retryCount
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`📱 Nomor bot: ${NOMOR_BOT}`);
    startBot();
});

// Fungsi mendapatkan proxy
function getProxyAgent() {
    const proxyUrl = PROXY_LIST[currentProxyIndex % PROXY_LIST.length];
    console.log('🔌 Menggunakan proxy:', proxyUrl);
    return new HttpsProxyAgent(proxyUrl);
}

async function startBot() {
    try {
        retryCount++;
        console.log(`🤖 Memulai bot... (percobaan ke-${retryCount})`);
        pairingCode = null;
        
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        // Buat agent proxy
        const agent = getProxyAgent();
        
        const sock = makeWASocket({
            auth: state,
            browser: ['Get Group ID', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            agent: agent,
            version: [2, 3000, 1015901308]
        });

        botSocket = sock;
        sock.ev.on('creds.update', saveCreds);

        // Cek apakah sudah login
        if (state.creds?.registered) {
            console.log('✅ Sudah pernah login, mencoba koneksi...');
        } else {
            console.log('📱 Belum login, meminta kode pairing...');
            
            // Minta kode pairing setelah 3 detik
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(NOMOR_BOT);
                    pairingCode = code;
                    console.log('✅ Kode pairing:', code);
                    retryCount = 0; // Reset retry count
                } catch (err) {
                    console.log('❌ Gagal minta kode:', err.message);
                }
            }, 3000);
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                isConnected = true;
                console.log('✅✅ BOT TERHUBUNG! ✅✅');
                retryCount = 0;
            }
            
            if (connection === 'close') {
                isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🚪 Logout, hapus session...');
                    try {
                        fs.rmSync('./auth', { recursive: true, force: true });
                        fs.mkdirSync('./auth');
                    } catch (e) {}
                }
                
                console.log('🔄 Koneksi terputus, ganti proxy dan reconnect...');
                currentProxyIndex++;
                setTimeout(startBot, 5000);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;
            
            const remoteJid = m.key.remoteJid;
            
            if (remoteJid && remoteJid.endsWith('@g.us')) {
                console.log('🎯 ID GRUP DITEMUKAN:', remoteJid);
                
                if (!groupsDetected.includes(remoteJid)) {
                    groupsDetected.unshift(remoteJid);
                    if (groupsDetected.length > 10) groupsDetected.pop();
                }
                
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

    } catch (err) {
        console.log('❌ Fatal error:', err.message);
        setTimeout(startBot, 10000);
    }
}
