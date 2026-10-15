const express = require('express');
const app = express();

// 1. PERBAIKAN PATH IMPORT: Sesuaikan ke folder data/ & config/
const storage = require('../data/storage');
const mikrotik = require('../config/mikrotik');

app.use(express.json());

// 1. ENDPOINT REGISTRASI USER BARU (WAJIB ADA)
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username dan Password wajib diisi' });
        }

        // Simpan data registrasi ke Redis storage
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

// 2. ENDPOINT GET USERS + LIVE TRAFFIC MIKROTIK
app.get('/api/users', async (req, res) => {
    try {
        // Matikan caching browser agar data selalu paling baru
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

        // PERBAIKAN: Gunakan getAllUsers() sesuai fungsi di storage.js
        const users = await storage.getAllUsers(); 

        // Ambil data statistik dari config/mikrotik.js
        const mtStats = await mikrotik.getUsersStats().catch(() => []);

        // Gabungkan live traffic ke data user database
        const responseUsers = users.map(user => {
            const mtUser = mtStats.find(u => u.name && u.name.toLowerCase() === user.username.toLowerCase());

            return {
                ...user,
                'bytes-in': mtUser ? mtUser['bytes-in'] : 0,
                'bytes-out': mtUser ? mtUser['bytes-out'] : 0,
                'packets-in': mtUser ? mtUser['packets-in'] : 0,
                'packets-out': mtUser ? mtUser['packets-out'] : 0,
                uptime: mtUser ? mtUser.uptime : '00:00:00'
            };
        });

        res.json({ success: true, users: responseUsers });
    } catch (error) {
        console.error('Error get users:', error.message);
        res.status(500).json({ success: false, message: 'Gagal mengambil data user' });
    }
});

// 3. ENDPOINT APPROVE (Simpan di DB + Tambah ke Hotspot WinBox)
app.post('/api/approve', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Update status di Storage Redis
        await storage.approveUser(username, 'Admin');

        // Tambahkan user ke Hotspot MikroTik
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
