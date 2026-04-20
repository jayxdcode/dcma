export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  const urlArray = req.url.split("/").filter(Boolean).slice(2);
  const path = "/" + urlArray.join("/");
  res.status(200).json({ url, urlArray, path });
}

