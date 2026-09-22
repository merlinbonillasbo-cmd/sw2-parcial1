import express from 'express';
import cors from 'cors';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { pool, initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(__dirname, 'generated');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'studio_case_secret_key_2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K1FtSl92mcEr9-OjwtXqToCTB-lOebpfC-ne2ywunlNg';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const JDL_MASTER_SYSTEM_PROMPT = `Eres un Ingeniero de Software experto en JHipster y JDL (JHipster Domain Language).
Tu ÚNICA función es convertir las peticiones de los usuarios en código JDL 100% sintácticamente perfecto y ejecutable por JHipster.

REGLAS DE SINTAXIS JDL ESTRICTAS Y OBLIGATORIAS:

1. ESTRUCTURA DE APLICACIÓN (SIEMPRE INCLUIR AL INICIO):
application {
  config {
    baseName MiApp,
    applicationType monolith,
    packageName com.miempresa.miapp,
    authenticationType jwt,
    prodDatabaseType postgresql,
    devDatabaseType h2Disk,
    buildTool maven,
    clientFramework react
  }
  entities *
}

2. REGLAS DE ENTIDADES Y CAMPOS:
- La sintaxis de cada campo es ESTRICTAMENTE: nombreCampo TipoCampo [validaciones]
- NUNCA pongas el tipo en paréntesis. Ejemplo: escribe "nombre String", NUNCA "nombre(String)".
- NUNCA inviertas el orden. Ejemplo: escribe "precio BigDecimal", NUNCA "BigDecimal precio".
- NUNCA crees un campo de ID ("UUID UUID" o "id Long"): JHipster genera el campo 'id' automáticamente para cada entidad.
- NUNCA uses "Void" ni tipos Java/SQL (varchar, int, datetime, text, number).
- TIPOS DE DATOS PERMITIDOS (PascalCase):
  * String
  * Integer
  * Long
  * BigDecimal
  * LocalDate
  * Instant
  * Boolean
  * UUID
  * Blob (o AnyBlob, ImageBlob, TextBlob)

3. SINTAXIS DE RELACIONES:
- NUNCA coloques relaciones dentro de la definición de una entidad (dentro de entity { ... }).
- NUNCA uses flechas: "->", "=>" o "-->" están ESTRICTAMENTE PROHIBIDOS.
- NUNCA uses pseudo-sintaxis como "has many", "belongs to", "has_many" o "belongs_to".
- Define las relaciones SIEMPRE en bloques independientes "relationship" usando la palabra reservada "to":
  relationship ManyToOne {
    Producto{categoria(nombre)} to Categoria
  }
  relationship OneToMany {
    Venta to DetalleVenta{venta required}
  }

4. BLOQUES PROHIBIDOS:
- NUNCA uses la palabra 'repository' (ej: 'repository all with spring-data-jpa' NO EXISTE EN JDL).
- NUNCA uses 'controller', 'router', 'table' o 'database'.

5. OPCIONES DE SALIDA AL FINAL:
paginate all with pagination
service all with serviceImpl

EJEMPLO COMPLETO Y VÁLIDO DE REFERENCIA QUE DEBES COPIAR Y SEGUIR EXACTAMENTE:

application {
  config {
    baseName SistemaGestion,
    applicationType monolith,
    packageName com.miempresa.gestion,
    authenticationType jwt,
    prodDatabaseType postgresql,
    devDatabaseType h2Disk,
    buildTool maven,
    clientFramework react
  }
  entities *
}

enum Estado {
  ACTIVO,
  INACTIVO
}

entity Categoria {
  nombre String required minlength(2)
}

entity Producto {
  nombre String required,
  descripcion String,
  precioUnitario BigDecimal required min(0),
  stock Integer required min(0),
  estado Estado
}

entity Venta {
  fecha Instant required,
  total BigDecimal required min(0),
  cliente String required
}

entity ItemVenta {
  cantidad Integer required min(1),
  precioUnitario BigDecimal required min(0)
}

relationship ManyToOne {
  Producto{categoria(nombre)} to Categoria,
  ItemVenta{producto(nombre)} to Producto
}

relationship OneToMany {
  Venta to ItemVenta{venta required}
}

paginate all with pagination
service all with serviceImpl`;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: UPLOADS_DIR });

// Middleware Autenticación JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Acceso no autorizado. Por favor inicia sesión.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Sesión expirada o token inválido.' });
    }
    req.user = user;
    next();
  });
}

// Construir JDL a partir del formulario
function buildJdlFromForm({ nombreProyecto, clientFramework, prodDatabaseType, authenticationType, buildTool, entidades }) {
  const sanitizeName = str => (str || 'MiProyecto').replace(/[^a-zA-Z0-9]/g, '');
  const appName = sanitizeName(nombreProyecto);

  let jdl = `application {\n  config {\n`;
  jdl += `    baseName ${appName},\n`;
  jdl += `    applicationType monolith,\n`;
  jdl += `    packageName com.miempresa.${appName.toLowerCase()},\n`;
  jdl += `    authenticationType ${authenticationType || 'jwt'},\n`;
  jdl += `    prodDatabaseType ${prodDatabaseType || 'postgresql'},\n`;
  jdl += `    devDatabaseType h2Disk,\n`;
  jdl += `    buildTool ${buildTool || 'maven'},\n`;
  jdl += `    clientFramework ${clientFramework || 'react'},\n`;
  jdl += `    skipClient ${clientFramework === 'no' ? 'true' : 'false'}\n`;
  jdl += `  }\n`;

  if (Array.isArray(entidades) && entidades.length > 0) {
    jdl += `  entities *\n`;
  }

  jdl += `}\n\n`;

  if (Array.isArray(entidades)) {
    entidades.forEach(ent => {
      if (!ent.nombre) return;
      const entName = sanitizeName(ent.nombre);
      jdl += `entity ${entName} {\n`;
      if (Array.isArray(ent.campos)) {
        ent.campos.forEach(field => {
          if (!field.nombre) return;
          const fieldType = field.tipo || 'String';
          const required = field.requerido ? ' required' : '';
          jdl += `  ${field.nombre} ${fieldType}${required},\n`;
        });
      }
      jdl += `}\n\n`;
    });
  }

  return jdl;
}

// Sanitizador y corrector avanzado de JDL generado por IA o ingresado por usuario
function sanitizeAndFixJdl(jdl) {
  if (!jdl || typeof jdl !== 'string') return '';

  let cleaned = jdl.trim();

  // 1. Eliminar completamente todas las marcas de bloque de código Markdown (```jdl, ```)
  cleaned = cleaned.replace(/```(?:jdl)?/gi, '').trim();

  // 2. Reemplazar flechas de relación no válidas (->, =>, -->) y pseudo-sintaxis (has many, belongs to) por 'to'
  cleaned = cleaned.replace(/-->|->|=>/g, ' to ');
  cleaned = cleaned.replace(/(\w+)\s+has[_\s]+many\s+(\w+)\s*,\s*\2\s+belongs[_\s]+to\s+\1/gi, '$1 to $2');
  cleaned = cleaned.replace(/(\w+)\s+has[_\s]+many\s+(\w+)/gi, '$1 to $2');
  cleaned = cleaned.replace(/(\w+)\s+belongs[_\s]+to\s+(\w+)/gi, '$1 to $2');

  // 3. Eliminar opciones o palabras alucinadas que NO existen en JDL (ej: repository, controller, etc.)
  cleaned = cleaned.replace(/^\s*(repository|controller|router|table|database|import)\b.*/gim, '');

  // 4. Mapeo de tipos de datos incorrectos (SQL/Java) a tipos válidos de JDL
  const validTypes = new Set([
    'String',
    'Integer',
    'Long',
    'BigDecimal',
    'LocalDate',
    'Instant',
    'ZonedDateTime',
    'Boolean',
    'UUID',
    'Blob',
    'AnyBlob',
    'ImageBlob',
    'TextBlob',
    'Float',
    'Double',
  ]);

  const typeMap = {
    string: 'String',
    varchar: 'String',
    text: 'String',
    char: 'String',
    int: 'Integer',
    integer: 'Integer',
    int4: 'Integer',
    long: 'Long',
    int8: 'Long',
    bigint: 'Long',
    double: 'BigDecimal',
    float: 'BigDecimal',
    decimal: 'BigDecimal',
    numeric: 'BigDecimal',
    number: 'BigDecimal',
    bigdecimal: 'BigDecimal',
    bool: 'Boolean',
    boolean: 'Boolean',
    date: 'LocalDate',
    localdate: 'LocalDate',
    datetime: 'Instant',
    timestamp: 'Instant',
    instant: 'Instant',
    uuid: 'UUID',
    void: 'BigDecimal',
    Void: 'BigDecimal',
  };

  // 5. Limpiar y corregir bloques entity
  cleaned = cleaned.replace(/entity\s+([A-Za-z0-9_]+)\s*\{([^}]*)\}/gi, (match, entityName, fieldsContent) => {
    const lines = fieldsContent.split('\n');
    const validLines = [];

    lines.forEach(rawLine => {
      // Reemplazar paréntesis innecesarios en la declaración del tipo de campo (ej: "nombre(String)" -> "nombre String")
      const line = rawLine.replace(/([a-zA-Z0-9_]+)\s*\(\s*([a-zA-Z0-9_]+)\s*\)/g, '$1 $2');
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) {
        validLines.push(line);
        return;
      }

      // Eliminar campos de ID o UUID redundantes/inválidos que la IA genera como clave primaria (JHipster crea 'id' automáticamente)
      if (/^(uuid|id)\s+(uuid|long|integer|string)\b/i.test(trimmed)) {
        return;
      }

      // Eliminar líneas de relaciones inválidas dentro de la entidad (ej: "Producto producto to one")
      if (/\bto\s+(one|many)\b/i.test(trimmed) || /\bto\b/i.test(trimmed)) {
        return;
      }

      let parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        let first = parts[0];
        let second = parts[1].replace(',', '');
        const hasComma = parts[1].endsWith(',');

        const lowerFirst = first.toLowerCase();
        const lowerSecond = second.toLowerCase();

        // Caso A: El usuario o la IA escribió "Tipo campo" (ej: "String nombre" o "integer cantidad") -> INVERTIR A "campo Tipo"
        if (validTypes.has(first) || typeMap[lowerFirst]) {
          const correctType = validTypes.has(first) ? first : typeMap[lowerFirst];
          const fieldName = second;
          parts[0] = fieldName;
          parts[1] = correctType + (hasComma ? ',' : '');
        }
        // Caso B: Escribió "campo tipo" pero tipo está en minúsculas (ej: "nombre string") -> Corregir tipo
        else if (typeMap[lowerSecond]) {
          parts[1] = typeMap[lowerSecond] + (hasComma ? ',' : '');
        }

        const indent = line.match(/^\s*/)[0] || '  ';
        validLines.push(indent + parts.join(' '));
      } else {
        validLines.push(line);
      }
    });

    return `entity ${entityName} {\n${validLines.join('\n')}\n}`;
  });

  // 5. Corregir comas sobrantes antes de llaves de cierre
  cleaned = cleaned.replace(/,\s*\}/g, '\n}');

  // 6. Garantizar bloque 'application' si no existe en el JDL
  if (!cleaned.includes('application {') && !cleaned.includes('application{')) {
    const defaultApp = `application {\n  config {\n    baseName MiApp,\n    applicationType monolith,\n    packageName com.miempresa.miapp,\n    authenticationType jwt,\n    prodDatabaseType postgresql,\n    devDatabaseType h2Disk,\n    buildTool maven,\n    clientFramework react\n  }\n  entities *\n}\n\n`;
    cleaned = defaultApp + cleaned;
  }

  // 7. Normalizar saltos de línea sobrantes y eliminar cualquier backtick suelto
  cleaned = cleaned.replace(/`/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

// Ejecutar JHipster Generator CLI
async function runJHipsterGeneration(genId, nombreProyecto, jdlContent) {
  const projectSlug = `${nombreProyecto.toLowerCase().replace(/[^a-z0-9]/g, '')}_${genId}_${Date.now()}`;
  const targetDir = path.join(GENERATED_DIR, projectSlug);
  const jdlPath = path.join(targetDir, 'schema.jdl');
  const zipPath = path.join(GENERATED_DIR, `${projectSlug}.zip`);

  const sanitizedJdl = sanitizeAndFixJdl(jdlContent);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(jdlPath, sanitizedJdl, 'utf-8');

  const cliPath = path.join(ROOT_DIR, 'bin', 'jhipster.cjs');
  const command = `node "${cliPath}" jdl "${jdlPath}" --skip-git --skip-install --no-insight`;

  console.log(`🚀 Generando proyecto [ID: ${genId}] en: ${targetDir}`);

  exec(command, { cwd: targetDir, maxBuffer: 1024 * 1024 * 50 }, async (error, stdout, stderr) => {
    const fullLog = (stdout || '') + '\n' + (stderr || '') + (error ? `\nError: ${error.message}` : '');
    const estado = error ? 'error' : 'completado';

    let finalZipPath = null;

    if (!error) {
      try {
        const zip = new AdmZip();
        zip.addLocalFolder(targetDir);
        zip.writeZip(zipPath);
        finalZipPath = zipPath;
      } catch (zipErr) {
        console.error('❌ Error comprimiendo ZIP:', zipErr.message);
      }
    }

    try {
      await pool.query(`UPDATE generaciones SET estado = $1, log_output = $2, zip_path = $3 WHERE id = $4`, [
        estado,
        fullLog,
        finalZipPath,
        genId,
      ]);
    } catch (dbErr) {
      console.error('❌ Error actualizando BD:', dbErr.message);
    }
  });
}

// ---------------- AUTH API ----------------

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios.' });
    }

    const userCheck = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Este correo electrónico ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query('INSERT INTO usuarios (nombre, email, password) VALUES ($1, $2, $3) RETURNING id, nombre, email', [
      nombre.trim(),
      email.toLowerCase().trim(),
      hashedPassword,
    ]);

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, nombre: user.nombre, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Correo y contraseña son requeridos.' });
    }

    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Credenciales inválidas.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ success: false, error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign({ id: user.id, nombre: user.nombre, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------- GEMINI AI CHAT API ----------------

app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Proporciona una descripción para la IA.' });
    }

    const systemPrompt = `${JDL_MASTER_SYSTEM_PROMPT}\n\nREGLA DE FORMATO DE RESPUESTA: Explica brevemente la arquitectura propuesta y SIEMPRE incluye el código JDL dentro de marcas de código triple \`\`\`jdl ... \`\`\`.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nSolicitud del usuario: ${prompt}` }],
            },
          ],
        }),
      },
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ success: false, error: data.error.message || 'Error en Gemini API' });
    }

    const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No se pudo obtener respuesta de la IA.';

    // Extraer y sanitizar bloque JDL
    let jdlCode = '';
    const match = aiReply.match(/```jdl\s*([\s\S]*?)\s*```/i) || aiReply.match(/```\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      jdlCode = match[1].trim();
    } else {
      jdlCode = aiReply.trim();
    }
    jdlCode = sanitizeAndFixJdl(jdlCode);

    res.json({ success: true, reply: aiReply, jdlCode });
  } catch (err) {
    console.error('Error en Gemini AI Chat:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------- OLLAMA AI CHAT API (LLAMA3) ----------------

app.post('/api/ai/ollama-chat', authenticateToken, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Proporciona una descripción para la IA.' });
    }

    const systemPrompt = `${JDL_MASTER_SYSTEM_PROMPT}\n\nREGLA DE SALIDA PARA OLLAMA: Responde ÚNICAMENTE con el bloque de código JDL encerrado en marcas \`\`\`jdl ... \`\`\`. NO agregues comentarios ni texto explicativo fuera del código.`;

    console.log(`🤖 Petición enviada a Ollama (${OLLAMA_HOST}) con modelo llama3...`);

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        system: systemPrompt,
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ success: false, error: `Error en Ollama (${response.statusText}): ${errText}` });
    }

    const data = await response.json();
    const rawReply = data.response || '';

    // Extraer y sanitizar bloque JDL
    let jdlCode = rawReply.trim();
    const match = rawReply.match(/```(?:jdl)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      jdlCode = match[1].trim();
    }
    jdlCode = sanitizeAndFixJdl(jdlCode);

    res.json({ success: true, reply: rawReply, jdlCode });
  } catch (err) {
    console.error('Error en Ollama AI Chat:', err);
    res.status(500).json({
      success: false,
      error: `No se pudo conectar con Ollama en ${OLLAMA_HOST}. Verifica que el contenedor de Ollama esté ejecutándose. Error: ${err.message}`,
    });
  }
});

// ---------------- VISION AI DIAGRAM TO JDL API ----------------

app.post('/api/ai/vision-jdl', authenticateToken, upload.single('diagramImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Por favor sube una imagen de un diagrama de clases.' });
    }

    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Data = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/png';

    try {
      fs.unlinkSync(imagePath);
    } catch (e) {}

    const visionPrompt = `${JDL_MASTER_SYSTEM_PROMPT}\n\nInstrucción especial: Analiza detenidamente la imagen del diagrama de clases adjunta. Extrae todas las entidades, sus campos con sus tipos válidos de JDL y sus relaciones. Responde ÚNICAMENTE con el bloque JDL dentro de \`\`\`jdl ... \`\`\`.`;

    console.log('🖼️ Procesando imagen de diagrama de clases con IA Visión...');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: visionPrompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ success: false, error: data.error.message || 'Error en Gemini Vision API' });
    }

    const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No se pudo analizar la imagen.';

    let jdlCode = '';
    const match = aiReply.match(/```jdl\s*([\s\S]*?)\s*```/i) || aiReply.match(/```\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      jdlCode = match[1].trim();
    } else {
      jdlCode = aiReply.trim();
    }
    jdlCode = sanitizeAndFixJdl(jdlCode);

    res.json({ success: true, reply: aiReply, jdlCode });
  } catch (err) {
    console.error('Error en Vision AI JDL:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------- GENERATOR API ----------------

app.post('/api/generate/indicaciones', authenticateToken, async (req, res) => {
  try {
    const { nombreProyecto } = req.body;
    const nombre = nombreProyecto || 'AppGenerada';
    const jdlContent = buildJdlFromForm(req.body);

    const result = await pool.query(
      `INSERT INTO generaciones (usuario_id, nombre_proyecto, tipo_generacion, contenido_jdl, estado) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, nombre, 'indicaciones', jdlContent, 'en_proceso'],
    );

    const gen = result.rows[0];
    runJHipsterGeneration(gen.id, nombre, jdlContent);

    res.json({ success: true, message: 'Generación iniciada', generation: gen });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/generate/jdl', authenticateToken, upload.single('jdlFile'), async (req, res) => {
  try {
    let jdlContent = req.body.jdlText || '';
    let nombre = req.body.nombreProyecto || 'AppJDL';

    if (req.file) {
      jdlContent = fs.readFileSync(req.file.path, 'utf-8');
      fs.unlinkSync(req.file.path);
    }

    if (!jdlContent.trim()) {
      return res.status(400).json({ success: false, error: 'No se proporcionó contenido JDL.' });
    }

    const matchBaseName = jdlContent.match(/baseName\s+([a-zA-Z0-9_]+)/);
    if (matchBaseName && matchBaseName[1]) {
      nombre = matchBaseName[1];
    }

    const result = await pool.query(
      `INSERT INTO generaciones (usuario_id, nombre_proyecto, tipo_generacion, contenido_jdl, estado) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, nombre, 'jdl', jdlContent, 'en_proceso'],
    );

    const gen = result.rows[0];
    runJHipsterGeneration(gen.id, nombre, jdlContent);

    res.json({ success: true, message: 'Generación JDL iniciada', generation: gen });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM generaciones WHERE usuario_id = $1 ORDER BY fecha_creacion DESC LIMIT 50`, [
      req.user.id,
    ]);
    res.json({ success: true, history: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM generaciones WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    const gen = result.rows[0];
    if (!gen.zip_path || !fs.existsSync(gen.zip_path)) {
      return res.status(404).json({ success: false, error: 'El archivo ZIP no está disponible.' });
    }

    res.download(gen.zip_path, `${gen.nombre_proyecto}_generated.zip`);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/status/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM generaciones WHERE id = $1 AND usuario_id = $2`, [id, req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No encontrado' });
    }
    res.json({ success: true, generation: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`🌐 Studio CASE Generator listo en: http://localhost:${PORT}`);
  });
}

start();
