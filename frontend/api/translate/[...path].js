export default async function handler(req, res) {
  const { path } = req.query;
  // Joins the catch-all path segments back into a string
  const subPath = Array.isArray(path) ? path.join('/') : path;
  
  const backendUrl = `${process.env.LRC_BACKEND_BASE}/api/translate/${subPath}`;

  try {
    const response = await fetch(backendUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LRC_BACKEND_API_KEY}`,
      },
      // Forward the body only for methods that support it
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) 
        ? JSON.stringify(req.body) 
        : undefined,
    });

    const data = await response.json();
    
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to proxy request' });
  }
}
