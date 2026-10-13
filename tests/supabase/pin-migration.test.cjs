const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {pgcrypto} = require('@electric-sql/pglite/contrib/pgcrypto');
const bcrypt = require('bcryptjs');
const sql = fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261013034508_hash_installer_pins.sql'),'utf8');

test('PIN migration hashes all seven synthetic plaintext PINs, verifies with bcrypt, and is rerun-safe', async () => {
  const db = new PGlite({extensions:{pgcrypto}});
  try {
    await db.exec('CREATE TABLE public.installers (id integer PRIMARY KEY, name text, pin text);');
    const pins=['0123','0123','123456','4567','98765','0000','654321'];
    for (const [i,pin] of pins.entries()) await db.query('INSERT INTO installers VALUES($1,$2,$3)',[i+1,`Synthetic ${i+1}`,pin]);
    const existing=bcrypt.hashSync('2222',4);
    await db.query('INSERT INTO installers VALUES(8,$1,$2),(9,$3,NULL),(10,$4,$5)',['Already hashed',existing,'No PIN','Blank','']);
    await db.exec(sql);
    const rows=(await db.query('SELECT id,name,pin FROM installers ORDER BY id')).rows;
    for (const [i,pin] of pins.entries()) {
      assert.equal(await bcrypt.compare(pin,rows[i].pin),true);
      assert.equal(bcrypt.getRounds(rows[i].pin),12);
      assert.equal(rows[i].name,`Synthetic ${i+1}`);
    }
    assert.notEqual(rows[0].pin,rows[1].pin,'Equal PINs must receive independent salts');
    assert.equal(rows[7].pin,existing); assert.equal(rows[8].pin,null); assert.equal(rows[9].pin,null);
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT id,name,pin FROM installers ORDER BY id')).rows,rows);
    await assert.rejects(db.query('UPDATE installers SET pin=$1 WHERE id=1',['1234']),/installers_pin_bcrypt_only/);
  } finally {await db.close();}
});

test('unexpected PIN formats abort the complete migration without changing valid plaintext rows', async () => {
  const db=new PGlite({extensions:{pgcrypto}});
  try {
    await db.exec("CREATE TABLE public.installers (id integer PRIMARY KEY,pin text); INSERT INTO installers VALUES(1,'0123'),(2,'bad-format');");
    await assert.rejects(db.exec(sql),/unexpected format/);
    await db.exec('ROLLBACK');
    assert.deepEqual((await db.query('SELECT pin FROM installers ORDER BY id')).rows.map(r=>r.pin),['0123','bad-format']);
  } finally {await db.close();}
});
