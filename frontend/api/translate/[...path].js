export const config = {
  api: {
    // Disable the default body parser to allow streaming of files/raw data
    bodyParser: false, 
  },
};

export default async function handler(req, res) {
  const { path, ...queryParams } = req.query;
  const subPath = Array.isArray(path) ? path.join('/') : path || '';
  
  // 1. Reconstruct the full backend URL with original query parameters
  const backendUrl = new URL(`${process.env.LRC_BACKEND_BASE}/api/translate/${subPath}`);
  Object.keys(queryParams).forEach(key => {
    backendUrl.searchParams.append(key, queryParams[key]);
  });

  // 2. Prepare headers (Forwarding client headers while adding Authorization)
  const headers = new Headers(req.headers);
  headers.set('Authorization', `Bearer ${process.env.LRC_BACKEND_API_KEY}`);
  // Remove the 'host' header to prevent SSL/routing issues at the destination
  headers.delete('host');

  try {
    const response = await fetch(backendUrl.toString(), {
      method: req.method,
      headers: headers,
      // Pass the raw request stream directly
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      // duplex: 'half' is required when forwarding a stream in Node/Next.js fetch
      duplex: 'half', 
    });

    // 3. Forward the backend's status code
    res.status(response.status);

    // 4. Forward all response headers (Content-Type, Cache-Control, etc.)
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // 5. Stream the response body back to the client
    // This handles JSON, binary (images/PDFs), or text automatically
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Failed to proxy request' });
  }
}
