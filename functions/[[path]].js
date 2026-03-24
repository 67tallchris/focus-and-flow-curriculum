import { jwtVerify, SignJWT } from 'jose';

// Helper to get JWT secret from env
function getJwtSecret(env) {
  return new TextEncoder().encode(env.JWT_SECRET || 'dev-secret-key-change-me');
}

// Helper: Generate unique ID
function generateId() {
  return crypto.randomUUID();
}

// Helper: Hash password (simple - in production use bcrypt)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Generate JWT token
async function generateToken(userId, email, env) {
  return await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getJwtSecret(env));
}

// Helper: Verify JWT token
async function verifyToken(token, env) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(env));
    return payload;
  } catch {
    return null;
  }
}

// Helper: Get user from request
async function getUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const payload = await verifyToken(token, env);
  if (!payload) {
    return null;
  }
  
  const { userId } = payload;
  const result = await env.COACHING_DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').bind(userId).first();
  return result;
}

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// API Routes handler
async function handleApi(request, env, url) {
  const path = url.pathname.replace('/api/', '').split('/');
  const method = request.method;
  
  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  
  // Route: POST /api/auth/register
  if (path[0] === 'auth' && path[1] === 'register' && method === 'POST') {
    try {
      const body = await request.json();
      const { email, password, name } = body;
      
      if (!email || !password) {
        return Response.json({ error: 'Email and password required' }, { status: 400, headers: corsHeaders() });
      }
      
      // Check if user exists
      const existing = await env.COACHING_DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        return Response.json({ error: 'User already exists' }, { status: 409, headers: corsHeaders() });
      }
      
      const userId = generateId();
      const passwordHash = await hashPassword(password);
      
      await env.COACHING_DB.prepare(
        'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
      ).bind(userId, email, passwordHash, name || null).run();
      
      const token = await generateToken(userId, email, env);
      
      return Response.json({ 
        user: { id: userId, email, name: name || null },
        token 
      }, { headers: corsHeaders() });
      
    } catch (error) {
      console.error('Register error:', error);
      return Response.json({ error: 'Registration failed' }, { status: 500, headers: corsHeaders() });
    }
  }
  
  // Route: POST /api/auth/login
  if (path[0] === 'auth' && path[1] === 'login' && method === 'POST') {
    try {
      const body = await request.json();
      const { email, password } = body;
      
      if (!email || !password) {
        return Response.json({ error: 'Email and password required' }, { status: 400, headers: corsHeaders() });
      }
      
      const passwordHash = await hashPassword(password);
      const user = await env.COACHING_DB.prepare(
        'SELECT id, email, name, created_at FROM users WHERE email = ? AND password_hash = ?'
      ).bind(email, passwordHash).first();
      
      if (!user) {
        return Response.json({ error: 'Invalid credentials' }, { status: 401, headers: corsHeaders() });
      }
      
      const token = await generateToken(user.id, user.email, env);
      
      return Response.json({ 
        user,
        token 
      }, { headers: corsHeaders() });
      
    } catch (error) {
      console.error('Login error:', error);
      return Response.json({ error: 'Login failed' }, { status: 500, headers: corsHeaders() });
    }
  }
  
  // Route: GET /api/auth/me
  if (path[0] === 'auth' && path[1] === 'me' && method === 'GET') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    return Response.json({ user }, { headers: corsHeaders() });
  }
  
  // Route: GET /api/progress
  if (path[0] === 'progress' && method === 'GET') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const progress = await env.COACHING_DB.prepare(
      'SELECT module_id, completed, completed_at FROM user_progress WHERE user_id = ?'
    ).bind(user.id).all();
    
    return Response.json({ progress: progress.results || [] }, { headers: corsHeaders() });
  }
  
  // Route: POST /api/progress
  if (path[0] === 'progress' && method === 'POST') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const body = await request.json();
    const { moduleId, completed } = body;
    
    if (!moduleId) {
      return Response.json({ error: 'Module ID required' }, { status: 400, headers: corsHeaders() });
    }
    
    const progressId = generateId();
    const completedAt = completed ? new Date().toISOString() : null;
    
    await env.COACHING_DB.prepare(`
      INSERT INTO user_progress (id, user_id, module_id, completed, completed_at) 
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, module_id) DO UPDATE SET 
        completed = excluded.completed,
        completed_at = excluded.completed_at,
        updated_at = CURRENT_TIMESTAMP
    `).bind(progressId, user.id, moduleId, completed ? 1 : 0, completedAt).run();
    
    return Response.json({ success: true }, { headers: corsHeaders() });
  }
  
  // Route: GET /api/responses/scenario/:moduleId
  if (path[0] === 'responses' && path[1] === 'scenario' && method === 'GET') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const moduleId = path[2];
    if (!moduleId) {
      return Response.json({ error: 'Module ID required' }, { status: 400, headers: corsHeaders() });
    }
    
    const response = await env.COACHING_DB.prepare(
      'SELECT response_text, created_at, updated_at FROM scenario_responses WHERE user_id = ? AND module_id = ?'
    ).bind(user.id, moduleId).first();
    
    return Response.json({ response: response || null }, { headers: corsHeaders() });
  }
  
  // Route: POST /api/responses/scenario
  if (path[0] === 'responses' && path[1] === 'scenario' && method === 'POST') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const body = await request.json();
    const { moduleId, responseText } = body;
    
    if (!moduleId || !responseText) {
      return Response.json({ error: 'Module ID and response text required' }, { status: 400, headers: corsHeaders() });
    }
    
    const responseId = generateId();
    await env.COACHING_DB.prepare(`
      INSERT INTO scenario_responses (id, user_id, module_id, response_text) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, module_id) DO UPDATE SET 
        response_text = excluded.response_text,
        updated_at = CURRENT_TIMESTAMP
    `).bind(responseId, user.id, moduleId, responseText).run();
    
    return Response.json({ success: true }, { headers: corsHeaders() });
  }
  
  // Route: GET /api/responses/reflection/:moduleId
  if (path[0] === 'responses' && path[1] === 'reflection' && method === 'GET') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const moduleId = path[2];
    if (!moduleId) {
      return Response.json({ error: 'Module ID required' }, { status: 400, headers: corsHeaders() });
    }
    
    const responses = await env.COACHING_DB.prepare(
      'SELECT prompt_number, response_text, created_at, updated_at FROM reflection_responses WHERE user_id = ? AND module_id = ? ORDER BY prompt_number'
    ).bind(user.id, moduleId).all();
    
    return Response.json({ responses: responses.results || [] }, { headers: corsHeaders() });
  }
  
  // Route: POST /api/responses/reflection
  if (path[0] === 'responses' && path[1] === 'reflection' && method === 'POST') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const body = await request.json();
    const { moduleId, promptNumber, responseText } = body;
    
    if (!moduleId || promptNumber === undefined || !responseText) {
      return Response.json({ error: 'Module ID, prompt number, and response text required' }, { status: 400, headers: corsHeaders() });
    }
    
    const responseId = generateId();
    await env.COACHING_DB.prepare(`
      INSERT INTO reflection_responses (id, user_id, module_id, prompt_number, response_text) 
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, module_id, prompt_number) DO UPDATE SET 
        response_text = excluded.response_text,
        updated_at = CURRENT_TIMESTAMP
    `).bind(responseId, user.id, moduleId, promptNumber, responseText).run();
    
    return Response.json({ success: true }, { headers: corsHeaders() });
  }
  
  // Route: GET /api/reading/:moduleId
  if (path[0] === 'reading' && method === 'GET') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const moduleId = path[1];
    if (!moduleId) {
      return Response.json({ error: 'Module ID required' }, { status: 400, headers: corsHeaders() });
    }
    
    const progress = await env.COACHING_DB.prepare(
      'SELECT book_title, is_read, created_at, updated_at FROM reading_progress WHERE user_id = ? AND module_id = ?'
    ).bind(user.id, moduleId).all();
    
    return Response.json({ progress: progress.results || [] }, { headers: corsHeaders() });
  }
  
  // Route: POST /api/reading
  if (path[0] === 'reading' && method === 'POST') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    const body = await request.json();
    const { moduleId, bookTitle, isRead } = body;
    
    if (!moduleId || !bookTitle) {
      return Response.json({ error: 'Module ID and book title required' }, { status: 400, headers: corsHeaders() });
    }
    
    const progressId = generateId();
    await env.COACHING_DB.prepare(`
      INSERT INTO reading_progress (id, user_id, module_id, book_title, is_read) 
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, module_id, book_title) DO UPDATE SET 
        is_read = excluded.is_read,
        updated_at = CURRENT_TIMESTAMP
    `).bind(progressId, user.id, moduleId, bookTitle, isRead ? 1 : 0).run();
    
    return Response.json({ success: true }, { headers: corsHeaders() });
  }
  
  // Route: GET /api/all-data
  if (path[0] === 'all-data' && method === 'GET') {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    
    // Get all user data in one query
    const [progress, scenarios, reflections, reading] = await Promise.all([
      env.COACHING_DB.prepare('SELECT module_id, completed, completed_at FROM user_progress WHERE user_id = ?').bind(user.id).all(),
      env.COACHING_DB.prepare('SELECT module_id, response_text, updated_at FROM scenario_responses WHERE user_id = ?').bind(user.id).all(),
      env.COACHING_DB.prepare('SELECT module_id, prompt_number, response_text, updated_at FROM reflection_responses WHERE user_id = ?').bind(user.id).all(),
      env.COACHING_DB.prepare('SELECT module_id, book_title, is_read, updated_at FROM reading_progress WHERE user_id = ?').bind(user.id).all()
    ]);
    
    return Response.json({
      progress: progress.results || [],
      scenarios: scenarios.results || [],
      reflections: reflections.results || [],
      reading: reading.results || []
    }, { headers: corsHeaders() });
  }
  
  // 404 for unknown routes
  return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders() });
}

// Main export
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }
    
    // Serve static assets
    const asset = env.ASSETS.get(url.pathname);
    if (asset) {
      return asset;
    }
    
    // Fallback to index.html for SPA routing
    return env.ASSETS.get('/index.html');
  }
};
