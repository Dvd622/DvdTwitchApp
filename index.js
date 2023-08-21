// Define our dependencies
const express        = require('express');
const session        = require('express-session');
const passport       = require('passport');
const OAuth2Strategy = require('passport-oauth').OAuth2Strategy;
const request        = require('request');
const handlebars     = require('handlebars');
const axios          = require('axios');
const controller     = require('./serverController');
const fs             = require('fs');
const bodyParser     = require('body-parser')
const https          = require('https')
const crypto         = require('crypto')
require('dotenv').config();

// Define our constants
const TWITCH_CLIENT_ID = process.env.CLIENT_ID;
const TWITCH_SECRET    = process.env.SECRET_KEY;
const BROADCASTER_ID   = process.env.BROADCASTER_ID;
const NGROK_URL        = process.env.NGROK_TUNNEL_URL;
const SESSION_SECRET   = crypto.randomBytes(48).toString('hex');
const CALLBACK_URL     = 'http://localhost:3000/auth/twitch/callback';  // You can run locally with - http://localhost:3000/auth/twitch/callback
var appAccessToken     = '';

// Initialize Express and middlewares
const app = express();
app.use(session({secret: SESSION_SECRET, resave: false, saveUninitialized: false}));
app.use(express.static('public'));
app.use(express.urlencoded({extended: true})); 
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json({
  verify: (req, res, buf) => {
      // Small modification to the JSON bodyParser to expose the raw body in the request object
      // The raw body is required at signature verification
      req.rawBody = buf
  }
}))

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
app.get('/auth/twitch', passport.authenticate('twitch', { scope: 'user:read:email analytics:read:games channel:read:subscriptions bits:read channel:manage:polls channel:manage:predictions channel:manage:redemptions moderator:read:followers' }));

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
      const appAccessTokenObj = await controller.getAppAccessToken();
      appAccessToken = appAccessTokenObj.access_token;

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
      //console.log(predictions['data'][0]);
      //console.log(rewardRedemptions);
      //console.log(rewards);
      //console.log(gameAnalytics);
      //console.log(bitsLeaderboard);
      
      /*
      fs.writeFile('./test.txt', 'test', err => {
        if (err) {
          console.error(err);
        }
        // file written successfully
      });
      */

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
<html>
  <head><title>Twitch Auth Sample</title></head>
  <style>
    body {background-color: #D3D3D3;}
  </style>
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
  </table>
</html>
`);

async function testFunc(testVar) {
  console.log(testVar);
}

var redeemTemplate = handlebars.compile(`
<html>
  <style>
  body {background-color: #D3D3D3;}
  </style>

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

// TO DO: twitch EventSub to listen/get redemption events + maybe udpate HTML page with endpoint calls
// HTML Page update: https://stackoverflow.com/questions/43523576/update-part-of-html-page-using-node-js-and-ejs
app.get('/redeem/start', async function (req, res) {
  if(req.session && req.session.passport && req.session.passport.user) {
    try {
      accessToken = req.session.passport.user.accessToken;
      userId = req.session.passport.user.id;
      const rewards = await controller.getCustomReward(accessToken, userId, true);
      rewardId = rewards["data"][0]["id"];
      const customRewardRedemptions = await controller.getCustomRewardRedemptions(accessToken, userId, rewardId, "UNFULFILLED");
      //res.send(redeemTemplate(req.session.passport.user));
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'An error occurred while starting redeem check' });
    }
    
  } else {
    res.redirect('/');
  }
});

// post redeem - creates redeem
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

// TODO:
// token refresher
// get EventSub Subscriptions: https://dev.twitch.tv/docs/api/reference/#get-eventsub-subscriptions
// function: refresh all event subscriptions
// delete (one/all) eventsubs
// pagination

// webhook creation with ngrok
app.post('/createWebhook', function(req, res) {
  webhook = controller.createWebhook(appAccessToken, "helix/eventsub/subscriptions", BROADCASTER_ID, "channel.update", "2", SESSION_SECRET)
  console.log('webhook:', webhook);
  res.send(webhook);
})

function verifySignature(messageSignature, messageID, messageTimestamp, body) {
  let message = messageID + messageTimestamp + body
  let signature = crypto.createHmac('sha256', SESSION_SECRET).update(message) // Remember to use the same secret set at creation
  let expectedSignatureHeader = "sha256=" + signature.digest("hex")

  return expectedSignatureHeader === messageSignature
}

app.post('/notification', (req, res) => {
  console.log('notif triggered');
  if (!verifySignature(req.header("Twitch-Eventsub-Message-Signature"),
          req.header("Twitch-Eventsub-Message-Id"),
          req.header("Twitch-Eventsub-Message-Timestamp"),
          req.rawBody)) {
      res.status(403).send("Forbidden") // Reject requests with invalid signatures
  } else {
      if (req.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
          console.log(req.body.challenge)
          res.send(req.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow

      } else if (req.header("Twitch-Eventsub-Message-Type") === "notification") {
        console.log(req.body.subscription)
          console.log(req.body.event) // Implement your own use case with the event data at this block
          res.send("") // Default .send is a 200 status
      }
  }
})

// If user has an authenticated session, display it, otherwise display link to authenticate
app.get('/', function (req, res) {
  if(req.session && req.session.passport && req.session.passport.user) {
    res.send(template(req.session.passport.user));
  } else {
    res.send('<html><head><title>Twitch Auth Sample</title></head> <style>body {background-color: #D3D3D3;}</style><a href="/auth/twitch">test</a><br><a href="/auth/twitch/test">test2</a></html>');
  }
});

app.listen(3000, function () {
  console.log('Twitch auth sample listening on port 3000!')
});