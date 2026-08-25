const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();

const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const API_SECRET = process.env.API_SECRET;

const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

app.use(express.json({ limit: '10kb' }));

// ================================
// LEADERBOARD FILE FUNCTIONS
// ================================

function loadLeaderboard() {
    try {
        if (!fs.existsSync(LEADERBOARD_FILE)) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(LEADERBOARD_FILE, 'utf8')
        );
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        return {};
    }
}

function saveLeaderboard(data) {
    fs.writeFileSync(
        LEADERBOARD_FILE,
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

// ================================
// HEALTH CHECK
// ================================

app.get('/', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        service: 'Elemental Ascension Leaderboard'
    });
});

// ================================
// GAME WEBHOOK
// ================================

app.post('/webhook', (req, res) => {

    // Check API secret
    if (req.get('X-API-Key') !== API_SECRET) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized'
        });
    }

    const { username, score, wave } = req.body;

    // Validate username
    if (
        typeof username !== 'string' ||
        username.trim().length === 0
    ) {
        return res.status(400).json({
            success: false,
            error: 'Invalid username'
        });
    }

    const cleanUsername = username
        .trim()
        .slice(0, 32);

    // Validate score
    const numericScore = Number(score);

    if (
        !Number.isFinite(numericScore) ||
        numericScore < 0
    ) {
        return res.status(400).json({
            success: false,
            error: 'Invalid score'
        });
    }

    // Validate wave
    const numericWave = Number(wave);

    if (
        !Number.isFinite(numericWave) ||
        numericWave < 0
    ) {
        return res.status(400).json({
            success: false,
            error: 'Invalid wave'
        });
    }

    const leaderboard = loadLeaderboard();

    const playerKey =
        cleanUsername.toLowerCase();

    const existing = leaderboard[playerKey];

    // ================================
    // EXISTING PLAYER
    // ================================

    if (existing) {

        const oldScore =
            Number(existing.score) || 0;

        const oldWave =
            Number(existing.wave) || 0;

        // New high score
        if (numericScore > oldScore) {

            leaderboard[playerKey] = {
                username: cleanUsername,
                score: numericScore,
                wave: Math.max(
                    numericWave,
                    oldWave
                )
            };

            saveLeaderboard(leaderboard);

            console.log(
                `NEW HIGH SCORE: ${cleanUsername} - ${numericScore}`
            );

            return res.json({
                success: true,
                updated: true,
                newHighScore: true
            });
        }

        // Higher wave but lower score
        if (numericWave > oldWave) {

            existing.wave = numericWave;

            saveLeaderboard(leaderboard);

            return res.json({
                success: true,
                updated: true,
                higherWave: true
            });
        }

        // Nothing improved
        return res.json({
            success: true,
            updated: false
        });
    }

    // ================================
    // NEW PLAYER
    // ================================

    leaderboard[playerKey] = {
        username: cleanUsername,
        score: numericScore,
        wave: numericWave
    };

    saveLeaderboard(leaderboard);

    console.log(
        `NEW PLAYER: ${cleanUsername} - ${numericScore}`
    );

    return res.status(201).json({
        success: true,
        updated: true,
        newPlayer: true
    });
});

// ================================
// DISCORD BOT
// ================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(
        `Discord bot logged in as ${client.user.tag}`
    );
});

// ================================
// !leaderboard COMMAND
// ================================

client.on('messageCreate', async (message) => {

    if (message.author.bot) {
        return;
    }

    if (
        message.content.trim().toLowerCase() !==
        '!leaderboard'
    ) {
        return;
    }

    const leaderboard =
        loadLeaderboard();

    const players =
        Object.values(leaderboard);

    if (players.length === 0) {
        await message.channel.send(
            '🏆 **Leaderboard**\n\n' +
            'No players have been recorded yet.'
        );

        return;
    }

    players.sort((a, b) => {

        const scoreDifference =
            Number(b.score) -
            Number(a.score);

        if (scoreDifference !== 0) {
            return scoreDifference;
        }

        return (
            Number(b.wave) -
            Number(a.wave)
        );
    });

    const top10 =
        players.slice(0, 10);

    let output =
        '🏆 **ELEMENTAL ASCENSION — TOP 10**\n\n';

    output +=
        '| Rank | Player | Score | Wave |\n';

    output +=
        '|---:|:---|---:|---:|\n';

    top10.forEach((player, index) => {

        const username =
            String(player.username)
                .replace(/\|/g, '\\|')
                .replace(/\n/g, ' ')
                .slice(0, 32);

        output +=
            `| ${index + 1} | ${username} | ` +
            `**${Number(player.score).toLocaleString()}** | ` +
            `${Number(player.wave).toLocaleString()} |\n`;
    });

    await message.channel.send(output);
});

// ================================
// START EVERYTHING
// ================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(
        `Server running on port ${PORT}`
    );
});

client.login(DISCORD_TOKEN);
