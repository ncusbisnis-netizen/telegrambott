// POLYFILL CRYPTO
if (!globalThis.crypto) {
    const crypto = require('crypto');
    globalThis.crypto = crypto;
}

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== KONFIGURASI ==========
const NOMOR_BOT = '6283133199990'; // GANTI DENGAN NOMOR BOT ANDA
const ADMIN_NOMOR = '6283133199991@s.whatsapp.net'; // GANTI DENGAN NOMOR ADMIN
// =================================

let pairingCode = null;
let isConnected = false;
let groupsDetected = [];

app.use(express.json());
app.use(express.static('public'));

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
            .btn { background: #128C7E; color: white; border: none; padding: 15px; border-radius: 10px; width: 100%; font-size: 16px; cursor: pointer; }
            .btn:hover { background: #075e54; }
            .code { background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 5px; margin: 20px 0; border-radius: 10px; }
            .group-item { background: #e8f5e9; padding: 15px; margin: 10px 0; border-radius: 5px; word-break: break-all; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 WA Bot Get Group ID</h1>
            <div class="info">
                <p><strong>Nomor Bot:</strong> ${NOMOR_BOT}</p>
                <p><strong>Status:</strong> <span id="status">${isConnected ? 'Terhubung' : 'Terputus'}</span></p>
            </div>
            
            <button class="btn" onclick="getPairing()">🔐 Dapatkan Kode Pairing</button>
            
            <div id="codeArea" style="display:none; margin-top:20px;">
                <div class="code" id="pairingCode"></div>
                <p style="text-align:center;">Masukkan kode ini di WhatsApp > 3 titik > Perangkat tertaut</p>
            </div>
            
            <div id="groupArea" style="display:none; margin-top:20px;">
                <h3>📱 Grup Terdeteksi</h3>
                <div id="groupList"></div>
            </div>
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
            
            async function checkStatus() {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                document.getElementById('status').innerText = data.connected ? 'Terhubung' : 'Terputus';
                
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
    if (pairingCode) {
        res.json({ code: pairingCode });
    } else {
        res.json({ error: 'Kode belum tersedia' });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        groups: groupsDetected
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    startBot();
});

async function startBot() {
    try {
        console.log('🤖 Memulai bot...');
        pairingCode = null;
        
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        const sock = makeWASocket({
            auth: state,
            browser: ['Get Group ID', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        if (!state.creds?.registered) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(NOMOR_BOT);
                    pairingCode = code;
                    console.log('✅ Kode pairing:', code);
                } catch (err) {
                    console.log('❌ Gagal minta kode:', err.message);
                }
            }, 2000);
        }

        sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            
            if (connection === 'open') {
                isConnected = true;
                console.log('✅ BOT TERHUBUNG!');
            }
            
            if (connection === 'close') {
                isConnected = false;
                console.log('❌ Koneksi terputus, reconnect...');
                setTimeout(startBot, 5000);
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
        setTimeout(startBot, 10000);
    }
}
