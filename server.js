import app from './src/server.js';
import { attachFeatureRoutes } from './src/featureRoutes.js';

const PORT = process.env.PORT || 3000;
attachFeatureRoutes(app);
app.use((await import('express')).default.static(new URL('./public', import.meta.url).pathname));

app.listen(PORT, () => {
  console.log(`NFL Cap Tracker website dev server: http://localhost:${PORT}`);
});

if (process.env.AUTO_SYNC !== 'false' && !process.env.VERCEL) {
  const mins = Math.max(10, Number(process.env.SYNC_MINUTES || 30));
  setInterval(async () => {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/sync/all`, { method: 'POST' });
      if (!r.ok) console.error('Automatic local sync failed:', await r.text());
    } catch (e) { console.error('Automatic local sync failed:', e); }
  }, mins * 60 * 1000);
}
