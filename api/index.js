// Vercel serverless entry. With DATABASE_URL set, the full platform runs here
// (accounts, recordings, teacher review, admin). Without it, this endpoint answers 503
// and the site falls back to the built-in serverless mode — so it works either way.
process.env.TZ ||= 'Asia/Almaty';

let handler;
try {
  const [{ default: app }, { ensureReady }] = await Promise.all([
    import('../server/app.js'),
    import('../server/bootstrap.js'),
  ]);
  handler = async (req, res) => {
    try { await ensureReady(); } catch (e) {
      console.error('setup failed', e);
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ error: 'Дерекқор дайындалмады: ' + e.message }));
    }
    return app(req, res);
  };
} catch (e) {
  console.error('backend unavailable:', e.message);
  handler = (req, res) => {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Сервер бөлігі қосылмаған (DATABASE_URL жоқ)', static_ok: true }));
  };
}

export default handler;
