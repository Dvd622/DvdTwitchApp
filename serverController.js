// Define our dependencies
const axios          = require('axios');
const { noConflict } = require('handlebars');
require('dotenv').config();

// Define constants
const TWITCH_CLIENT_ID = process.env.CLIENT_ID;
const TWITCH_SECRET    = process.env.SECRET_KEY;

// Function to get channel games analytics information
async function getAnalyticsGames(accessToken) {
    const response = await axios.get('https://api.twitch.tv/helix/analytics/games', {
        headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
        }
    });
return response.data.data;
}
  
// Function to get bits leaderboard information
async function getBitsLeaderboard(accessToken) {
    const response = await axios.get('https://api.twitch.tv/helix/bits/leaderboard', {
        headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
        }
    });
return response.data;
}
  
// Function to get polls information
async function getPolls(accessToken, userId) {
    const response = await axios.get(`https://api.twitch.tv/helix/polls`, {
        headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
        },
        params: {
            broadcaster_id: userId
        },
    });
    return response.data;
}

/**
 * Function to create a poll
 * @param {string} accessToken 
 * @param {string} userId user id
 * @param {string} pollTitle 
 * @param {Array} pollChoices choices: [ {"title":"Heads"}, {"title":"tails"} ]
 * @param {integer} pollDuration 
 * @returns Data
 */
async function createPoll(accessToken, userId, pollTitle, pollChoices, pollDuration=15) {
    const response = await axios.post(`https://api.twitch.tv/helix/polls`, {
            'broadcaster_id': userId,
            'title': pollTitle,
            'choices': pollChoices,
            'duration': pollDuration
        }, {
        headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
        }
    });
    return response.data;
}

/**
 * Function to get predictions
 * @param {*} accessToken 
 * @param {*} userId 
 * @returns 
 */
async function getPredictions(accessToken, userId) {
    const response = await axios.get(`https://api.twitch.tv/helix/predictions`, {
        headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
        },
        params: {
            broadcaster_id: userId
        },
    });
    return response.data;
}

/** 
 * Function to create a prediction
 * @accessToken {string} access token - requires channel:manage:predictions scope
 * @userId {string} broadcaster user id
 * @predictionTitle {string} max 45 chars
 * @predictionOutcomes {list[ {"title":"outcome1"}, {"title":"outcome2"} ]} 2-10 outcomes, title max 25 characters
 * @predictionWindow {integer} length of prediction window in seconds, default/minimum = 30, max = 1800 (30 mins)
 */ 
async function createPrediction(accessToken, userId, predictionTitle, predictionOutcomes, predictionWindow=30) {
    const response = await axios.post(`https://api.twitch.tv/helix/predictions`, {
            'broadcaster_id': userId,
            'title': predictionTitle,
            'outcomes': predictionOutcomes,
            'prediction_window': predictionWindow
        }, {
        headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
        }
    });
    return response.data;
}


module.exports = {
    getAnalyticsGames,
    getBitsLeaderboard,
    getPolls,
    createPoll,
    getPredictions,
    createPrediction
}