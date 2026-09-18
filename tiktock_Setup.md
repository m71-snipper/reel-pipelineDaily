# TikTok API Authorization & Connection Blueprint

This document guides the automated pipeline agent to successfully authenticate and establish a permanent secure connection with the TikTok Content Posting API (Sandbox/Production Mode) using dynamic PKCE authorization strings.

The project environment variables `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` are already defined and saved inside the `.env` file.

---

## 🛠️ Step 1: Initialize Authorization Server Route

To bypass TikTok's strict security filters, the agent must generate an ephemeral, URL-safe cryptographically secure `code_verifier` string and its corresponding SHA256 hashed `code_challenge`.

Create a separate script or inject these temporary Express.js routes into the application backend:

```javascript
const express = require("express");
const crypto = require("crypto");
const app = express();

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const REDIRECT_URI = "http://localhost:3000/callback";

let codeVerifierGlobal = ""; // Ephemeral global holder for token exchange stage

// 1. Initial Access Gateway Route
app.get("/login", (req, res) => {
  // Generate secure dynamic PKCE parameters
  const verifier = crypto.randomBytes(32).toString("base64url");
  codeVerifierGlobal = verifier;

  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest()
    .toString("base64url");

  const authUrl =
    `https://tiktok.com?` +
    `client_key=${CLIENT_KEY}` +
    `&scope=video.upload,video.publish` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256`;

  res.send(
    `<h1>SuperNeuron Authorization Gateway</h1><a href="${authUrl}" style="font-size:20px;color:green;">Link Official TikTok Account</a>`,
  );
});

// 2. Incoming OAuth Callback Processor
app.get("/callback", (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("Error: Authorization code token missing.");

  res.send(
    `<h2>Success! Authorization Code Generated</h2><textarea id="codeBox" rows="4" cols="60">${code}</textarea>`,
  );
});

app.listen(3000, () =>
  console.log("Auth server initialized at http://localhost:3000/login"),
);
```

---

## 🔑 Step 2: Extracting the Authorization Code

1. The agent spins up the server using `node tiktok-setup.md` or equivalent process orchestration.
2. Open a standard browser target at `http://localhost:3000/login`.
3. Click the explicit activation anchor tag "Link Official TikTok Account".
4. The user completes the native TikTok authorization screen consent prompts.
5. TikTok safely routes the callback array payload back to the explicit server hook at `http://localhost:3000/callback`.
6. Extract the unique, plain text parameter string contained inside the `<textarea id="codeBox">` component. This value is your valid temporary `Authorization Code`.

---

## 🔄 Step 3: Complete Token Processing (Exchange & Firestore Sync)

Once the temporary string code is achieved, the server script must immediately fire a secure outbound POST transaction directly to TikTok's structural auth endpoint to fetch the actual long-lived `access_token` and `refresh_token`.

### Outbound Payload Signature Strategy:

- **Endpoint**: `https://tiktokapis.com`
- **Headers**: `Content-Type: application/x-www-form-urlencoded`
- **Body Data Properties Matrix**:
  - `client_key`: Map directly from the localized config variable `TIKTOK_CLIENT_KEY`.
  - `client_secret`: Map directly from the localized config variable `TIKTOK_CLIENT_SECRET`.
  - `code`: The string token generated inside Step 2 above.
  - `grant_type`: Explicit constant string literal set to `"authorization_code"`.
  - `redirect_uri`: Strict literal fallback string matching `"http://localhost:3000/callback"`.
  - `code_verifier`: Supply the exact dynamic plain string saved globally inside the initialization block from Step 1 (`codeVerifierGlobal`).

### Database Orchestration (Phase N/O/P Integration):

1. Capture the verified JSON response return parameters.
2. Persist the `access_token` and long-term `refresh_token` object structure straight down inside the Firestore centralized system cluster document path: `system_config/tiktok_auth`.
3. Compute the automatic exact integer Unix millisecond offset variable value for the explicit token expiration clock window (`expires_at`), matching the exact calculated dynamic date parameter response key bounds.

The primary programmatic publishing core system background worker framework can now fetch live access permissions silently, automatedly refreshing expired security states behind the curtain 100% autonomously.
