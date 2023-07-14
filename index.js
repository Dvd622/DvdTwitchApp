// Define our dependencies
const express        = require('express');
const session        = require('express-session');
const passport       = require('passport');
const OAuth2Strategy = require('passport-oauth').OAuth2Strategy;
const request        = require('request');
const handlebars     = require('handlebars');
const axios          = require('axios');
const controller     = require('./serverController');
require('dotenv').config();

// Define our constants, you will change these with your own
const TWITCH_CLIENT_ID = process.env.CLIENT_ID;
const TWITCH_SECRET    = process.env.SECRET_KEY;
const SESSION_SECRET   = 'test123';
const CALLBACK_URL     = 'http://localhost:3000/auth/twitch/callback';  // You can run locally with - http://localhost:3000/auth/twitch/callback

// Initialize Express and middlewares
const app = express();
app.use(session({secret: SESSION_SECRET, resave: false, saveUninitialized: false}));
app.use(express.static('public'));
app.use(express.urlencoded({extended: true})); 
app.use(passport.initialize());
app.use(passport.session());

// Override passport profile function to get user profile from Twitch API
OAuth2Strategy.prototype.userProfile = function(accessToken, done) {
  var options = {
    url: 'https://api.twitch.tv/helix/users',
    method: 'GET',
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Accept': 'application/vnd.twitchtv.v5+json',
      'Authorization': 'Bearer ' + accessToken
    }
  };

  request(options, function (error, response, body) {
    if (response && response.statusCode == 200) {
      done(null, JSON.parse(body));
    } else {
      done(JSON.parse(body));
    }
  });
}

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(user, done) {
    done(null, user);
});

passport.use('twitch', new OAuth2Strategy({
    authorizationURL: 'https://id.twitch.tv/oauth2/authorize',
    tokenURL: 'https://id.twitch.tv/oauth2/token',
    clientID: TWITCH_CLIENT_ID,
    clientSecret: TWITCH_SECRET,
    callbackURL: CALLBACK_URL,
    state: true,
  },
  function(accessToken, refreshToken, profile, done) {
    profile.accessToken = accessToken;
    profile.refreshToken = refreshToken;
    //profile.display_name = profile.display_name;
    //console.log(profile.data[0]);
    profile.id = profile.data[0].id;
    profile.display_name = profile.data[0].display_name;
    profile.bio = profile.data[0].description;
    profile.image_url = profile.data[0].profile_image_url;
    profile.test = "test";

    // Securely store user profile in your DB
    //User.findOrCreate(..., function(err, user) {
    //  done(err, user);
    //});

    done(null, profile);
  }
));

// Set route to start OAuth link, this is where you define scopes to request
app.get('/auth/twitch', passport.authenticate('twitch', { scope: 'user:read:email analytics:read:games channel:read:subscriptions bits:read channel:manage:polls channel:manage:predictions channel:manage:redemptions' }));

// Set route for OAuth redirect
app.get('/auth/twitch/callback', passport.authenticate('twitch', { successRedirect: '/', failureRedirect: '/fail' }));

// test - not needed anymore
app.get('/auth/twitch/test', passport.authenticate('twitch', { scope: 'analytics:read:games channel:read:subscriptions', successRedirect: '/test', failureRedirect: '/fail' }));

app.get('/test', async function (req, res) {
  if(req.session && req.session.passport && req.session.passport.user) {
    try {
      accessToken = req.session.passport.user.accessToken;
      userId = req.session.passport.user.id;
      const gameAnalytics = await controller.getAnalyticsGames(accessToken);
      const bitsLeaderboard = await controller.getBitsLeaderboard(accessToken);
      const polls = await controller.getPolls(accessToken, userId);
      const rewards = await controller.getCustomReward(accessToken, userId, true);
      //const rewardRedemptions = await controller.getCustomRewardRedemptions(accessToken, userId, 'reward-id', 'UNFULFILLED')

      var choices = [{
        'title':'Heads'
      },
      {
        'title':'Tails'
      }]
      //const poll = await controller.createPoll(accessToken, userId, 'Heads or tails?', choices, 15);
      //const prediction = await controller.createPrediction(accessToken, userId, "Heads or tails?", choices, 30);
      const predictions = await controller.getPredictions(accessToken, userId);
      res.json([polls, gameAnalytics, bitsLeaderboard, predictions]);
      console.log(predictions['data'][0]);
      //console.log(rewardRedemptions);
      console.log(rewards);
      //console.log(gameAnalytics);
      //console.log(bitsLeaderboard);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An error occurred while fetching test' });
    }
  } else {
    res.redirect('/');
  }
});

// If user has an authenticated session, display it, otherwise display link to authenticate
app.get('/fail', function (req, res) {
    res.send('<html><head><title>Twitch Auth Sample</title></head> <p>FAILED</p></html>');
});

// Define a simple template to safely generate HTML with values from user's profile
var template = handlebars.compile(`
<html><head><title>Twitch Auth Sample</title></head>
<table>
    <tr><th>Access Token</th><td>yes</td></tr>
    <tr><th>Refresh Token</th><td>yes</td></tr>
    <tr><th>Display Name</th><td>{{display_name}}</td></tr>
    <tr><th>Bio</th><td>{{bio}}</td></tr>
    <tr><th>Image</th><td>{{logo}}</td></tr>
    <tr><th>Test:</th><td>{{test}}</td></tr>
    <tr><td><img src={{image_url}} alt="Dvd Profile Image"></td></tr>
    <button onClick="location.href = '/test'">Click me!!!</button>
    <button onClick="location.href = '/redeem'">Custom Redeem Testing</button>
</table></html>`);

async function testFunc(testVar) {
  console.log(testVar);
}

var redeemTemplate = handlebars.compile(`
<html>
  <script src="index.js"></script>

  <head><title>Custom Redeem</title></head>
  <form method="POST" action="/redeem">
    <label for="titleId">Title: </label><input id="titleId" name="title" type="text">
    <br><br>
    <label for="costId">Cost: </label><input type="number" id="costId" name="cost" type="text">
    <br><br>
    <label for="promptId">Prompt: </label><input id="promptId" name="prompt" type="text">
    <br><br>
    <button type="submit">Submit</button>
  </form>
  <br><br>
  <p id="testId">Test Text</p>

  <script>
  function submitRedeem() {
    var title = document.getElementById("titleId").value;
    var cost = document.getElementById("costId").value;
    var prompt = document.getElementById("promptId").value;
    document.getElementById("testId").innerHTML = title + cost + prompt;
    testFunc([title, cost, prompt]);
  }
  </script>
</html>
`);

app.get('/redeem', function (req, res) {
  if(req.session && req.session.passport && req.session.passport.user) {
    res.send(redeemTemplate(req.session.passport.user));
  } else {
    res.redirect('/');
  }
});

app.post('/redeem', async function(req, res) {
  if(req.session && req.session.passport && req.session.passport.user) {
    try {
      accessToken = req.session.passport.user.accessToken;
      userId = req.session.passport.user.id;
      var title = req.body.title;
      var cost = req.body.cost;
      var prompt = req.body.prompt;
      const customReward = await controller.createCustomReward(accessToken, userId, title, cost, prompt);
      res.send(req.body);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An error occurred while posting redeem' });
    }
  } else {
    res.redirect('/');
  }
  
});

// If user has an authenticated session, display it, otherwise display link to authenticate
app.get('/', function (req, res) {
  if(req.session && req.session.passport && req.session.passport.user) {
    res.send(template(req.session.passport.user));
  } else {
    res.send('<html><head><title>Twitch Auth Sample</title></head> <a href="/auth/twitch">test</a><br><a href="/auth/twitch/test">test2</a></html>');
  }
});

app.listen(3000, function () {
  console.log('Twitch auth sample listening on port 3000!')
});