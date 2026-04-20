export const config = {
  api: {
    // Disable the default body parser to allow streaming of files/raw data
    bodyParser: false, 
  },
};

export default async function handler(req, res) {
  const { ...queryParams } = req.query;

  // external api expects the same shape (/api/translate) so no need to modify path
  const backendUrl = new URL(req.url, process.env.LRC_BACKEND_BASE);
  Object.keys(queryParams).forEach(key => {
    backendUrl.searchParams.append(key, queryParams[key]);
  });

  // Prepare headers (Forwarding client headers while adding Authorization)
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

    // Forward the backend's status code
    res.status(response.status);

    // Forward all response headers (Content-Type, Cache-Control, etc.)
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Stream the response body back to the client
    // This handles JSON, binary (images/PDFs), or text automatically
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Failed to proxy request' });
  }
}
