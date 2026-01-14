
const fs = require('fs');
const bcrypt = require('bcryptjs');
const s = bcrypt.hashSync('password123', 10);
const c = bcrypt.hashSync('customer123', 10);
fs.writeFileSync('hashes.txt', `STAFF=${s}\nCUST=${c}`);
