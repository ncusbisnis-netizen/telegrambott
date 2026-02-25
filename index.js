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

// Daftar proxy gratis (update dari https://free-proxy-list.net/)
const PROXY_LIST = [
    'http://51.158.68.133:8811',
    'http://51.158.123.35:9999',
    'http://51.158.172.165:8811',
    'http://139.162.78.109:3128',
    'http://165.22.73.197:3128',
    'http://165.22.73.197:3128',
    'http://167.99.172.167:3128'
];

let pairingCode = null;
let isConnected = false;
let groupsDetected = [];
let currentProxyIndex = 0;

app.use(express.json());

if (!fs.existsSync('./auth')) {
    fs.mkdirSync('./auth');
}

// Halaman utama
app.get('/', (req, res) => {
    res.send(`
    <html>
    <head>
        <title>WA Bot Get Group ID</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial; padding: 20px; background: #f0f2f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 15px; padding: 20px; }
            h1 { color: #128C7E; }
            .info { background: #f8f9fa; padding: 15px; border-radius: 10px; margin: 20px 0; }
            .status { padding: 10px; border-radius: 5px; }
            .connected { background: #d4edda; color: #155724; }
            .disconnected { background: #f8d7da; color: #721c24; }
            .btn { background: #128C7E; color: white; border: none; padding: 15px; border-radius: 10px; width: 100%; font-size: 16px; cursor: pointer; margin: 5px 0; }
            .btn:hover { background: #075e54; }
            .btn-secondary { background: #6c757d; }
            .code { background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 5px; margin: 20px 0; border-radius: 10px; }
            .group-item { background: #e8f5e9; padding: 15px; margin: 10px 0; border-radius: 5px; word-break: break-all; }
            .proxy-info { font-size: 12px; color: #666; margin-top: 10px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 WA Bot Get Group ID</h1>
            <div class="info">
                <p><strong>Nomor Bot:</strong> ${NOMOR_BOT}</p>
                <p><strong>Status:</strong> <span id="status">${isConnected ? 'Terhubung' : 'Terputus'}</span></p>
                <p><strong>Proxy:</strong> <span id="proxyStatus">Aktif</span></p>
            </div>
            
            <button class="btn" onclick="getPairing()">🔐 Dapatkan Kode Pairing</button>
            <button class="btn btn-secondary" onclick="gantiProxy()">🔄 Ganti Proxy</button>
            
            <div id="codeArea" style="display:none; margin-top:20px;">
                <div class="code" id="pairingCode"></div>
                <p style="text-align:center;">Masukkan kode ini di WhatsApp > 3 titik > Perangkat tertaut</p>
            </div>
            
            <div id="groupArea" style="display:none; margin-top:20px;">
                <h3>📱 Grup Terdeteksi</h3>
                <div id="groupList"></div>
            </div>
            
            <div class="proxy-info" id="proxyInfo"></div>
        </div>
        
        <script>
            async function getPairing() {
                const res = await fetch('/api/pairing');
                const data = await res.json();
                if (data.code) {
                    document.getElementById('pairingCode').innerText = data.code;
                    document.getElementById('codeArea').style.display = 'block';
                } else {
                    alert('Kode belum siap, coba lagi nanti');
                }
            }
            
            async function gantiProxy() {
                const res = await fetch('/api/ganti-proxy', { method: 'POST' });
                const data = await res.json();
                alert(data.message);
                location.reload();
            }
            
            async function checkStatus() {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                document.getElementById('status').innerText = data.connected ? 'Terhubung' : 'Terputus';
                document.getElementById('proxyInfo').innerText = 'Proxy: ' + data.proxy;
                
                if (data.connected) {
                    document.getElementById('codeArea').style.display = 'none';
                    document.getElementById('groupArea').style.display = 'block';
                    
                    if (data.groups.length > 0) {
                        let html = '';
                        data.groups.forEach(g => {
                            html += '<div class="group-item">' + g + '</div>';
                        });
                        document.getElementById('groupList').innerHTML = html;
                    }
                }
            }
            
            setInterval(checkStatus, 3000);
            checkStatus();
        </script>
    </body>
    </html>
    `);
});

app.get('/api/pairing', (req, res) => {
    res.json({ code: pairingCode });
});

app.post('/api/ganti-proxy', (req, res) => {
    currentProxyIndex++;
    res.json({ message: 'Mengganti proxy...' });
});

app.get('/api/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        groups: groupsDetected,
        proxy: PROXY_LIST[currentProxyIndex % PROXY_LIST.length]
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
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
        console.log('🤖 Memulai bot...');
        pairingCode = null;
        
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        // Buat agent proxy
        const agent = getProxyAgent();
        
        const sock = makeWASocket({
            auth: state,
            browser: ['Get Group ID', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            agent: agent, // PAKAI PROXY
            version: [2, 3000, 1015901308]
        });

        sock.ev.on('creds.update', saveCreds);

        // Minta kode pairing
        setTimeout(async () => {
            try {
                console.log('📱 Meminta kode pairing...');
                const code = await sock.requestPairingCode(NOMOR_BOT);
                pairingCode = code;
                console.log('✅ Kode pairing:', code);
            } catch (err) {
                console.log('❌ Gagal minta kode:', err.message);
            }
        }, 3000);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                isConnected = true;
                console.log('✅✅ BOT TERHUBUNG! ✅✅');
            }
            
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log('🔄 Koneksi terputus, ganti proxy dan reconnect...');
                    currentProxyIndex++; // Ganti proxy
                    setTimeout(startBot, 3000);
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
                
                try {
                    await sock.sendMessage(ADMIN_NOMOR, {
                        text: `🔹 ID GRUP: ${remoteJid}`
                    });
                } catch (e) {}
            }
        });

    } catch (err) {
        console.log('❌ Error:', err.message);
        setTimeout(startBot, 5000);
    }
}
