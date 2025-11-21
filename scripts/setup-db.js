const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.argv[2];

if (!connectionString) {
    console.error('Please provide the connection string as an argument.');
    console.error('Usage: node scripts/setup-db.js "postgres://user:pass@host:5432/db"');
    process.exit(1);
}

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function setup() {
    try {
        await client.connect();
        console.log('Connected to database...');

        const sqlPath = path.join(__dirname, '../supabase_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running schema migration...');
        await client.query(sql);

        console.log('✅ Database setup complete!');
    } catch (err) {
        console.error('❌ Error setting up database:', err);
    } finally {
        await client.end();
    }
}

setup();
