require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { db } = require('../config/firebase');
const logger = require('../config/logger');

const app = express();
app.use(express.urlencoded({ extended: true }));

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
// The fallback intercept URL from user instructions to bypass Localhost/HTTP block
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

let codeVerifierGlobal = "";

app.get("/login", (req, res) => {
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    return res.send("Error: TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET missing in .env");
  }

  // Generate secure dynamic PKCE parameters
  const verifier = crypto.randomBytes(32).toString("base64url");
  codeVerifierGlobal = verifier;

  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest()
    .toString("base64url");

  const authUrl =
    `https://www.tiktok.com/v2/auth/authorize/?` +
    `client_key=${CLIENT_KEY}` +
    `&scope=video.upload,video.publish` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256`;

  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
        <h1>TikTok Authorization Gateway</h1>
        <p style="background: #fff3cd; padding: 10px; border-left: 4px solid #ffc107;">
          <b>Notice:</b> TikTok enforces strict HTTPS for redirects. We are spoofing the redirect using a safe external URL.
        </p>
        <p>
          <a href="${authUrl}" style="display:inline-block; padding: 15px 25px; background: #000; color: #fff; text-decoration: none; font-size: 18px; border-radius: 8px; font-weight: bold;" target="_blank">1. Click Here to Authorize TikTok</a>
        </p>
        <hr style="margin: 30px 0;"/>
        
        <h2>2. Extract the Code</h2>
        <p>After granting permission, TikTok will redirect you to a <b>TermsFeed privacy page</b>.</p>
        <p>Look at your browser's top Address Bar. It will look like this:</p>
        <pre style="background: #eee; padding: 10px; border-radius: 4px; overflow-x: auto;">https://www.termsfeed.com/live/3ee5ed26-f720-4aa9-8422-dd1985eb9c6b?<b>code=xxxxxxx</b></pre>
        <p>Copy that <b>ENTIRE URL</b> from the address bar and paste it below:</p>
        
        <form action="/submit-code" method="POST" style="background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
          <input type="text" name="code_url" placeholder="https://www.termsfeed.com/live/...?code=..." style="width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;" required/>
          <button type="submit" style="padding: 12px 25px; background: #28a745; color: white; border: none; font-size: 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">Complete Authentication</button>
        </form>
      </body>
    </html>
  `);
});

app.post("/submit-code", async (req, res) => {
  let code = req.body.code_url;
  if (!code) return res.send("Error: No URL or code provided.");

  // Extract 'code' parameter if full URL is pasted
  if (code.includes('?')) {
    try {
      const urlStr = code.startsWith('http') ? code : 'https://' + code;
      const urlObj = new URL(urlStr);
      if (urlObj.searchParams.has('code')) {
        code = urlObj.searchParams.get('code');
      }
    } catch (e) {
      // fallback
      const match = code.match(/code=([^&]+)/);
      if (match) code = match[1];
    }
  } else {
    const match = code.match(/code=([^&]+)/);
    if (match) code = match[1];
  }

  try {
    const params = new URLSearchParams();
    params.append('client_key', CLIENT_KEY);
    params.append('client_secret', CLIENT_SECRET);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code_verifier', codeVerifierGlobal);

    logger.info('[TIKTOK] Exchanging authorization code for access token...');
    
    const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      }
    });

    const data = response.data;
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    const expires_in = data.expires_in || 86400; 
    const expires_at = Date.now() + (expires_in * 1000);

    const refresh_expires_in = data.refresh_expires_in || 31536000;
    const refresh_expires_at = Date.now() + (refresh_expires_in * 1000);

    await db.collection('system_config').doc('tiktok_auth').set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expires_at,
      refresh_expires_at: refresh_expires_at,
      open_id: data.open_id,
      updated_at: new Date().toISOString()
    });

    logger.info('[TIKTOK] Successfully authenticated and saved tokens to Firestore.');
    res.send('<h2>Success! Tokens successfully saved to Firestore.</h2><p>You can now close this window and return to the terminal.</p>');
    
  } catch (error) {
    logger.error(`[TIKTOK] Auth exchange failed: ${error.message}`);
    if (error.response) {
      logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    res.send(`<h2>Error exchanging code for token</h2><p>${error.message}</p>`);
  }
});

app.listen(3000, () => {
  console.log("=========================================");
  console.log("TikTok Secure Auth Server Initialized");
  console.log("Please open: http://localhost:3000/login");
  console.log("=========================================");
});
