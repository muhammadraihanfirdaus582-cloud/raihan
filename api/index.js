const express = require('express');
const app = express();

const storage = require('../data/storage');
const mikrotik = require('../config/mikrotik');

app.use(express.json());

// 1. ENDPOINT REGISTRASI
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username dan Password wajib diisi' });
        }

        const newUser = await storage.addUser({ name, email, phone, username, password });

        res.json({ 
            success: true, 
            message: 'Registrasi berhasil, menunggu persetujuan admin',
            user: newUser 
        });
    } catch (error) {
        console.error('Error registrasi:', error.message);
        res.status(500).json({ success: false, message: 'Gagal melakukan registrasi' });
    }
});

// 2. ENDPOINT GET USERS + LIVE TRAFFIC (AMAIN & FAST)
app.get(['/api/users', '/api/admin/users'], async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

        // 1. Ambil data dari Storage Redis DULU
        const users = await storage.getAllUsers(); 

        // 2. Timeout max 2.5 detik untuk MikroTik
        let mtStats = [];
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('MikroTik Timeout')), 2500)
            );
            mtStats = await Promise.race([mikrotik.getUsersStats(), timeoutPromise]);
        } catch (mtErr) {
            console.warn('MikroTik offline/slow, fallback data lokal.');
            mtStats = [];
        }

        // 3. Gabungkan data
        const responseUsers = (users || []).map(user => {
            const mtUser = Array.isArray(mtStats) 
                ? mtStats.find(u => u.name && u.name.toLowerCase() === user.username.toLowerCase()) 
                : null;

            return {
                ...user,
                'bytes-in': mtUser ? mtUser['bytes-in'] : 0,
                'bytes-out': mtUser ? mtUser['bytes-out'] : 0,
                'packets-in': mtUser ? mtUser['packets-in'] : 0,
                'packets-out': mtUser ? mtUser['packets-out'] : 0,
                uptime: mtUser ? mtUser.uptime : '00:00:00'
            };
        });

        return res.status(200).json({ success: true, users: responseUsers });
    } catch (error) {
        console.error('Error get users:', error.message);
        return res.status(200).json({ success: true, users: [] });
    }
});

// 3. ENDPOINT APPROVE
app.post('/api/approve', async (req, res) => {
    try {
        const { username, password } = req.body;

        await storage.approveUser(username, 'Admin');

        if (password) {
            await mikrotik.addUserToHotspot(username, password);
        }

        res.json({ success: true, message: `User ${username} berhasil disetujui` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. ENDPOINT REJECT
app.post('/api/reject', async (req, res) => {
    try {
        const { username } = req.body;

        await storage.rejectUser(username, 'Admin');
        await mikrotik.removeUserFromHotspot(username);

        res.json({ success: true, message: `User ${username} berhasil ditolak` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. ENDPOINT DELETE USER
app.delete('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;

        await storage.deleteUser(username);
        await mikrotik.removeUserFromHotspot(username);

        res.json({ success: true, message: `User ${username} berhasil dihapus` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = app;
