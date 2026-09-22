import pg from 'pg';

const { Pool } = pg;

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'adminn',
  database: process.env.DB_NAME || 'generador',
};

export const pool = new Pool(dbConfig);

export async function initDb() {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createGeneracionesTable = `
    CREATE TABLE IF NOT EXISTS generaciones (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      nombre_proyecto VARCHAR(255) NOT NULL,
      tipo_generacion VARCHAR(50) NOT NULL,
      contenido_jdl TEXT NOT NULL,
      estado VARCHAR(50) NOT NULL DEFAULT 'en_proceso',
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      zip_path VARCHAR(500),
      log_output TEXT
    );
  `;

  try {
    const client = await pool.connect();
    await client.query(createUsersTable);
    await client.query(createGeneracionesTable);
    
    // Intentar agregar usuario_id si la tabla generaciones ya existía sin esa columna
    try {
      await client.query(`ALTER TABLE generaciones ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;`);
    } catch (e) {
      // Columna ya existe o no aplica
    }

    client.release();
    console.log('✅ Base de datos PostgreSQL conectada. Tablas "usuarios" y "generaciones" listas.');
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error.message);
    console.warn('⚠️ La aplicación continuará funcionando pero la autenticación requiere PostgreSQL activo.');
  }
}
