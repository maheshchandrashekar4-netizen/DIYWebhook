const express = require('express');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────
app.use(express.json());

// Serve UI folder for the Journey Builder config modal
app.use('/ui', express.static(path.join(__dirname, 'ui')));

// Serve config.json for SFMC activity registration
app.get('/config.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'config.json'));
});

// ── Optional: JWT verification helper ──────────────────────────────────
function verifyJwt(req, res, next) {
  const secret = process.env.SFMC_JWT_SECRET;
  if (!secret) return next();

  const token = req.body && req.body.jwt;
  if (!token) return res.status(401).json({ error: 'Missing JWT' });

  try {
    req.sfmcPayload = jwt.verify(token, secret);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid JWT', detail: err.message });
  }
}

// ── /save ───────────────────────────────────────────────────────────────
app.post('/save', verifyJwt, (req, res) => {
  console.log('[SAVE]', JSON.stringify(req.body, null, 2));
  res.status(200).json({ saved: true });
});

// ── /validate ───────────────────────────────────────────────────────────
app.post('/validate', verifyJwt, (req, res) => {
  console.log('[VALIDATE]', JSON.stringify(req.body, null, 2));

  const inArgs = getInArguments(req.body);
  const url    = inArgs.webhookUrl || '';

  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ message: 'Webhook URL is required and must be a valid URL.' });
  }

  res.status(200).json({ valid: true });
});

// ── /publish ─────────────────────────────────────────────────────────────
app.post('/publish', verifyJwt, (req, res) => {
  console.log('[PUBLISH]', JSON.stringify(req.body, null, 2));
  res.status(200).json({ published: true });
});

// ── /stop ────────────────────────────────────────────────────────────────
app.post('/stop', verifyJwt, (req, res) => {
  console.log('[STOP]', JSON.stringify(req.body, null, 2));
  res.status(200).json({ stopped: true });
});

// ── /execute ─────────────────────────────────────────────────────────────
app.post('/execute', verifyJwt, async (req, res) => {
  console.log('[EXECUTE]', JSON.stringify(req.body, null, 2));

  const inArgs = getInArguments(req.body);

  const contactPayload = {
    contactKey:   inArgs.contactKey   || null,
    emailAddress: inArgs.emailAddress || null,
    firstName:    inArgs.firstName    || null,
    lastName:     inArgs.lastName     || null,
    journeyName:  inArgs.journeyName  || null,
    activityName: inArgs.activityName || null,
    timestamp:    new Date().toISOString(),
  };

  if (inArgs.extraPayload) {
    try {
      const extra = JSON.parse(inArgs.extraPayload);
      Object.assign(contactPayload, extra);
    } catch (e) {
      console.warn('[EXECUTE] Could not parse extraPayload:', e.message);
    }
  }

  const webhookUrl = inArgs.webhookUrl;
  const method     = (inArgs.method || 'POST').toUpperCase();

  if (!webhookUrl) {
    console.error('[EXECUTE] No webhookUrl configured.');
    return res.status(200).json({ status: 'error', reason: 'No webhookUrl configured' });
  }

  const headers = { 'Content-Type': 'application/json' };
  if (inArgs.authHeader && inArgs.authValue) {
    headers[inArgs.authHeader] = inArgs.authValue;
  }

  try {
    const response = await axios({
      method,
      url: webhookUrl,
      headers,
      data: contactPayload,
      timeout: 8000,
    });

    console.log(`[EXECUTE] Webhook responded ${response.status} for contact: ${contactPayload.contactKey}`);
    return res.status(200).json({ status: 'ok', webhookStatus: response.status });

  } catch (err) {
    const status = err.response ? err.response.status : 'network_error';
    console.error(`[EXECUTE] Webhook failed (${status}):`, err.message);
    return res.status(200).json({ status: 'webhook_error', reason: err.message, webhookStatus: status });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────
function getInArguments(body) {
  const inArgsArray =
    body?.inArguments ||
    body?.arguments?.execute?.inArguments ||
    [];
  return inArgsArray.reduce((acc, obj) => Object.assign(acc, obj), {});
}

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  SFMC Custom Activity server running on port ${PORT}`);
  console.log(`   UI config modal : http://localhost:${PORT}/ui/index.html`);
  console.log(`   Config JSON     : http://localhost:${PORT}/config.json`);
  console.log(`   Execute endpoint: http://localhost:${PORT}/execute\n`);
});
