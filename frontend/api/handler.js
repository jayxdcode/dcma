import piped from './handlers/piped.js';
import test from './handlers/test.js';
import translate from './handlers/translate.js';
import embed from './handlers/embed.js';

const routes = {
	piped,
	test,
	translate,
	embed
};

export default function handler(req, res) {
	const url = new URL(req.url, `http://${req.headers.host}`);

	// just extract the first segment to decide handler
	const match = url.pathname.split('/')[2];

	const fn = routes[match];

	if (!fn) {
		return res.status(404).end();
	}

	// pass raw req/res — handler does EVERYTHING else
	return fn(req, res);
}
