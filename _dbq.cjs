const { Pool } = require('pg');
let url = process.env.DATABASE_URL || '';
url = url.replace(/channel_binding=require\s*/g, 'channel_binding=disable');
const pool = new Pool({ connectionString: url, max: 3 });
(async () => {
  try {
    const sql = process.argv[2];
    const res = await pool.query(sql);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error("ERR:", e.message);
  } finally { await pool.end(); }
})();
